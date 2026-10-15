#!/usr/bin/env node
/**
 * easy-apply-one.js — Apply to a single LinkedIn job via Easy Apply.
 * Usage: node scripts/easy-apply-one.js <jobId> [jobTitle]
 * Returns JSON: { status: "applied"|"failed"|"no_button"|"captcha"|"stuck", ... }
 *
 * Page-side logic lives in scripts/lib/ea-form.js (plain JS, executed via base64 eval —
 * no shell/template interpolation issues). Form answers come from DB (users.data.*).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const FORM_JS = path.join(__dirname, 'lib', 'ea-form.js');

function shell(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, cwd: REPO, maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return e.stdout || e.message || '';
  }
}

function browser(args, timeout = 30000) {
  return shell(`node "${path.join(REPO, '.agents/skills/browser-automation/scripts/browser.js')}" exec ${args}`, timeout);
}

function evalJS(js, timeout = 20000) {
  const b64 = Buffer.from(js, 'utf8').toString('base64');
  const raw = browser(`eval "eval(atob(\\"${b64}\\"))"`, timeout);
  const match = raw.match(/### Result\n([\s\S]*?)\n### Ran/);
  if (!match) return null;
  let val = match[1].trim();
  for (let i = 0; i < 4; i++) {
    if (typeof val !== 'string') break;
    try { val = JSON.parse(val); } catch { break; }
  }
  return val;
}

function evalFile(file, timeout = 30000) {
  return evalJS(fs.readFileSync(file, 'utf8'), timeout);
}

function dbQuery(sql) {
  try {
    const out = execSync(`node "${path.join(REPO, 'scripts', 'db.js')}" '${sql.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8', timeout: 15000, cwd: REPO,
    });
    const jsonStart = out.indexOf('[');
    return JSON.parse(out.slice(jsonStart));
  } catch (e) { return []; }
}

function loadUserData() {
  const userId = parseInt(process.env.USER_ID || '1', 10);
  const row = dbQuery(`SELECT data->'profile' AS profile, data->'personal_info' AS personal, data->'form_answers' AS answers FROM users WHERE id = ${userId}`)[0];
  return {
    profile: row?.profile || {},
    personal: row?.personal || {},
    answers: row?.answers || {},
  };
}

function sleep(ms) {
  execSync(`sleep ${Math.ceil(ms / 1000)}`, { timeout: ms + 5000 });
}

const jobId = process.argv[2];
const jobTitle = process.argv[3] || '';

if (!jobId) {
  console.error('Usage: node scripts/easy-apply-one.js <jobId> [jobTitle]');
  process.exit(1);
}

const USER = loadUserData();

// Navigate to job
browser(`goto "https://www.linkedin.com/jobs/view/${jobId}/"`, 30000);
sleep(4);

// Inject answers into page context
evalJS(`window.__EA = ${JSON.stringify(USER)}; 'ea_set'`);

// Click Easy Apply
const clicked = evalJS(`(function(){
  var btn = document.querySelector('button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"]');
  if (!btn) {
    var all = document.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) {
      var t = all[i].textContent || '';
      if (t.indexOf('Easy Apply') >= 0 || t.indexOf('Solicitud sencilla') >= 0) { btn = all[i]; break; }
    }
  }
  if (!btn) return 'no_btn';
  btn.click();
  return 'clicked';
})()`);

if (clicked !== 'clicked') {
  console.log(JSON.stringify({ status: 'no_button', jobId, jobTitle }));
  process.exit(0);
}

sleep(4);

let lastPage = '';
let stuckCount = 0;

for (let step = 0; step < 16; step++) {
  const res = evalFile(FORM_JS);
  if (!res) { sleep(2); continue; }
  const r = typeof res === 'string' ? JSON.parse(res) : res;

  if (r.done) {
    const applied = !!r.applied;
    console.log(JSON.stringify({ status: applied ? 'applied' : 'failed', jobId, jobTitle, reason: r.reason || (applied ? '' : 'no_modal') }));
    process.exit(0);
  }

  const page = `p${r.page}`;
  console.error(`Page ${r.page}: ${(r.text || '').substring(0, 90).replace(/\n/g, ' ')}${r.stuck && r.stuck.length ? ' | STUCK: ' + r.stuck.join(' ; ') : ''}${r.clicked ? ' | clicked:' + r.clicked : ''}`);

  const low = (r.text || '').toLowerCase();
  if (low.indexOf('captcha') >= 0 || low.indexOf('security check') >= 0) {
    console.log(JSON.stringify({ status: 'captcha', jobId, jobTitle }));
    process.exit(0);
  }

  // Detect stuck loop: same page with unanswered required fields, twice
  if (page === lastPage && r.stuck && r.stuck.length) {
    stuckCount++;
    if (stuckCount >= 3) {
      console.log(JSON.stringify({ status: 'stuck', jobId, jobTitle, fields: r.stuck }));
      process.exit(0);
    }
  } else if (page !== lastPage) {
    stuckCount = 0;
  }
  lastPage = page;

  sleep(3);
}

// Final verify: did it actually submit?
const verify = evalJS(`(function(){var t=document.body.innerText;if(t.indexOf('Application submitted')>=0||t.indexOf('was sent')>=0)return 'applied';var s=document.querySelector('dialog[open]');if(s)return 'still_open:'+s.innerText.substring(0,150);return 'not_applied';})()`);
const ok = verify === 'applied';
console.log(JSON.stringify({ status: ok ? 'applied' : 'failed', jobId, jobTitle, reason: ok ? '' : String(verify).substring(0, 200) }));

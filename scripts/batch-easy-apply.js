#!/usr/bin/env node
/**
 * batch-easy-apply.js — Apply to a list of LinkedIn job IDs via Easy Apply.
 * Validated pattern: navigate → click Easy Apply → fill steps → submit → verify.
 *
 * Form data (country, salary, city, years of experience, etc.) is read from DB
 * at runtime (users.data.form_answers + users.data.personal_info). Never hardcoded.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const WAIT = 3000;

function shell(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return e.stdout || e.message || '';
  }
}

function evalJS(js, timeout = 15000) {
  const escaped = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const raw = shell(`node .agents/skills/browser-automation/scripts/browser.js exec eval "${escaped}"`, timeout);
  const match = raw.match(/### Result\n(.+)/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return match[1]; }
}

function dbQuery(sql) {
  try {
    return JSON.parse(
      execSync(`node ${__dirname}/db.js "${sql.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8', timeout: 15000, cwd: __dirname,
      })
    );
  } catch (e) { return []; }
}

function dbWrite(sql) {
  try { shell(`node scripts/db.js "${sql.replace(/"/g, '\\"')}" --write`, 10000); } catch (e) { console.error('DB error:', e.message); }
}

function loadUserData() {
  const row = dbQuery("SELECT data->'profile' AS profile, data->'personal_info' AS personal, data->'job_preferences' AS prefs, data->'form_answers' AS form_answers FROM users WHERE id = ${process.env.USER_ID || 1}")[0];
  return {
    profile: row?.profile || {},
    personal: row?.personal || {},
    prefs: row?.prefs || {},
    formAnswers: row?.form_answers || {},
  };
}

const USER = loadUserData();
const ANSWERS = USER.formAnswers;

function sleep(ms) {
  execSync(`sleep ${Math.ceil(ms / 1000)}`, { timeout: ms + 5000, cwd: process.cwd() });
}

function getModal() {
  return evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){return all[i];}}return null;})()`);
}

function getModalText() {
  return evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){return all[i].innerText.substring(0,2000);}}return '';})()`);
}

function clickButton(textPattern) {
  return evalJS(`(function(){var buttons=document.querySelectorAll('button');for(var i=0;i<buttons.length;i++){var t=buttons[i].textContent.trim().toLowerCase();if(t.includes('${textPattern}')){buttons[i].click();return 'clicked:'+t;}}return 'not_found';})()`);
}

function applyToJob(jobId, jobTitle) {
  console.log(`\n--- ${jobId}: ${jobTitle} ---`);

  // Navigate
  shell(`node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/jobs/view/${jobId}/"`);
  sleep(WAIT);

  // Click Easy Apply
  const click = evalJS(`(function(){var btn=document.querySelector('button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"]');if(!btn){var all=document.querySelectorAll('button');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Easy Apply')||all[i].textContent.includes('Solicitud sencilla')){btn=all[i];break;}}}if(btn){btn.click();return 'clicked';}return 'no_btn';})()`);
  if (click !== 'clicked') {
    console.log('SKIP: No Easy Apply');
    return { status: 'no_button' };
  }
  sleep(WAIT);

  // Process up to 6 steps
  for (let step = 0; step < 6; step++) {
    const text = getModalText();
    if (!text || text.length < 10) {
      // Check if submitted
      const bodyText = evalJS(`document.body.innerText.substring(0,500)`);
      if (bodyText && (bodyText.includes('Application submitted') || bodyText.includes('was sent'))) {
        console.log('APPLIED (no modal)');
        return { status: 'applied' };
      }
      console.log('No modal, checking status...');
      sleep(2000);
      const bodyText2 = evalJS(`(function(){var t=document.body.innerText;var idx=t.indexOf('Application');if(idx>-1)return t.substring(idx,idx+50);return '';})()`);
      if (bodyText2 && bodyText2.includes('submitted')) return { status: 'applied' };
      break;
    }

    const pageMatch = text.match(/(\d+)\/(\d+)\s*pages/);
    const page = pageMatch ? pageMatch[1] : '?';
    console.log(`Page ${page}: ${text.substring(0, 100).replace(/\n/g, ' ')}`);

    // Step 1: Contact info - set phone country code from DB (personal_info.country)
    if (text.includes('Phone country code') || text.includes('Contact info')) {
      const country = USER.personal?.country || '';
      evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var selects=all[i].querySelectorAll('select');for(var j=0;j<selects.length;j++){if(selects[j].options.length>50){for(var k=0;k<selects[j].options.length;k++){if(selects[j].options[k].text.includes('${country}')){selects[j].selectedIndex=k;selects[j].dispatchEvent(new Event('change',{bubbles:true}));break;}}}break;}break;}}return 'done';})()`);
      sleep(500);
    }

    // Fill text inputs from DB form_answers (years of experience, salary, city, etc.)
    if (text.includes('years') || text.includes('experience') || text.includes('Additional Questions')) {
      const awsExp = ANSWERS.aws_experience || '';
      const engExp = ANSWERS.engineering_experience || ANSWERS.years_of_experience || '';
      const pyExp = ANSWERS.python_experience || '';
      const salary = ANSWERS.salary_usd ? (ANSWERS.salary_usd_max ? `${ANSWERS.salary_usd}-${ANSWERS.salary_usd_max} USD/month` : `${ANSWERS.salary_usd} USD/month`) : '';
      const city = ANSWERS.location || USER.personal?.city || '';
      const notice = ANSWERS.notice_period || '';
      evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var inputs=all[i].querySelectorAll('input[type=text]');var nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;inputs.forEach(function(inp){if(inp.value===''){var label='';var prev=inp.closest('label')||inp.previousElementSibling;if(prev)label=prev.textContent.toLowerCase();var parent=inp.parentElement;if(parent)label=label||parent.textContent.toLowerCase();if(label.includes('aws')||label.includes('amazon')){if('${awsExp}'){nativeSetter.call(inp,'${awsExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(label.includes('engineering')||label.includes('experience')){if('${engExp}'){nativeSetter.call(inp,'${engExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(label.includes('python')){if('${pyExp}'){nativeSetter.call(inp,'${pyExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(label.includes('salary')||label.includes('expectation')||label.includes('compensation')){if('${salary}'){nativeSetter.call(inp,'${salary}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(label.includes('city')){if('${city}'){nativeSetter.call(inp,'${city}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(label.includes('notice')||label.includes('availability')){if('${notice}'){nativeSetter.call(inp,'${notice}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}});break;}}return 'done';})()`);
      sleep(500);
    }

    // Handle radio buttons (Yes/No questions)
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var radios=all[i].querySelectorAll('input[type=radio]');var groups={};radios.forEach(function(r){if(!groups[r.name])groups[r.name]=[];groups[r.name].push(r);});Object.keys(groups).forEach(function(name){var opts=groups[name].map(function(r){return r.value.toLowerCase();});if(opts.includes('yes')&&opts.includes('no')){groups[name].forEach(function(r){if(r.value.toLowerCase()==='yes')r.click();});}else if(opts.includes('true')&&opts.includes('false')){groups[name].forEach(function(r){if(r.value.toLowerCase()==='true')r.click();});}});break;}}return 'done';})()`);
    sleep(500);

    // Handle checkboxes (terms, consent)
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var cbs=all[i].querySelectorAll('input[type=checkbox]');cbs.forEach(function(cb){if(!cb.checked)cb.click();});break;}}return 'done';})()`);
    sleep(500);

    // Check if review/submit page
    if (text.toLowerCase().includes('review your application')) {
      console.log('Review page, submitting...');
      const submit = clickButton('submit application');
      sleep(WAIT + 1000);

      // Verify
      const verify = evalJS(`(function(){var t=document.body.innerText;var idx=t.indexOf('Application');if(idx>-1)return t.substring(idx,idx+30);return t.substring(0,200);})()`);
      if (verify && (verify.includes('submitted') || verify.includes('was sent'))) {
        console.log('APPLIED');
        return { status: 'applied' };
      }
      // Try alternative submit
      const submit2 = clickButton('submit');
      sleep(WAIT);
      const verify2 = evalJS(`(function(){var t=document.body.innerText;var idx=t.indexOf('Application');if(idx>-1)return t.substring(idx,idx+30);return '';})()`);
      if (verify2 && (verify2.includes('submitted') || verify2.includes('was sent'))) {
        console.log('APPLIED (alt submit)');
        return { status: 'applied' };
      }
      console.log('Submit may have failed: ' + verify);
      return { status: 'submit_failed' };
    }

    // Click Next or Review
    let next = clickButton('review');
    if (next === 'not_found') next = clickButton('next');
    if (next === 'not_found') next = clickButton('siguiente');
    if (next === 'not_found') {
      // Try submit directly
      const submit = clickButton('submit');
      if (submit !== 'not_found') {
        sleep(WAIT);
        const verify = evalJS(`(function(){var t=document.body.innerText;if(t.includes('submitted')||t.includes('was sent'))return 'applied';return t.substring(0,200);})()`);
        if (verify === 'applied') return { status: 'applied' };
      }
      console.log('No next/submit button found');
      break;
    }
    sleep(WAIT);
  }

  // Final check
  const finalCheck = evalJS(`(function(){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return 'applied';return 'not_applied';})()`);
  return { status: finalCheck === 'applied' ? 'applied' : 'failed' };
}

// Main
const args = process.argv.slice(2);
const jobsFile = args[0] || '.tmp-jobs.json';
const maxIdx = args.indexOf('--max');
const maxJobs = maxIdx > -1 ? parseInt(args[maxIdx + 1], 10) : 50;
const startIdx = args.indexOf('--start');
const startAt = startIdx > -1 ? parseInt(args[startIdx + 1], 10) : 0;

const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
const toProcess = jobs.slice(startAt, startAt + maxJobs);

console.log(`Processing ${toProcess.length} jobs (starting from ${startAt})`);

const results = [];
for (let i = 0; i < toProcess.length; i++) {
  const job = toProcess[i];
  console.log(`\n[${i + 1}/${toProcess.length}] ${job.title} (${job.id})`);

  const result = applyToJob(job.id, job.title);
  results.push({ ...result, jobId: job.id, jobTitle: job.title });

  if (result.status === 'applied') {
    const safeTitle = job.title.replace(/'/g, "''");
    dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (${process.env.USER_ID || 1}, 'linkedin', '', '${safeTitle}', 'https://www.linkedin.com/jobs/view/${job.id}/', 'applied', NOW(), '{"source": "batch_easy_apply"}')`);
    console.log(`DB: recorded`);
  }

  sleep(2000); // anti-ban
}

// Summary
const applied = results.filter(r => r.status === 'applied');
const failed = results.filter(r => r.status !== 'applied');
console.log(`\n=== SUMMARY ===`);
console.log(`Applied: ${applied.length}/${results.length}`);
console.log(`Failed: ${failed.length}`);
applied.forEach(r => console.log(`  OK: ${r.jobTitle}`));
failed.forEach(r => console.log(`  SKIP: ${r.jobTitle} - ${r.status}`));

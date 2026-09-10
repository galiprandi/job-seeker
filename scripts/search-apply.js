#!/usr/bin/env node
/**
 * search-apply.js — Apply to LinkedIn Easy Apply jobs from the search page.
 * Validated pattern: scroll search → click Easy Apply "to" button → fill typeahead location →
 * select dropdown → Review → Submit → verify.
 *
 * Form data (country, salary, city, years of experience, keywords, etc.) is read
 * from DB at runtime (users.data.form_answers + users.data.personal_info + users.data.profile).
 * Never hardcoded.
 *
 * Usage: node scripts/search-apply.js [--max 50] [--keywords "..."]
 */
const { execSync } = require('child_process');

function shell(cmd, timeout = 30000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout, cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    return e.stdout || e.message || '';
  }
}

function evalJS(js, timeout = 20000) {
  const escaped = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const raw = shell(`node .agents/skills/browser-automation/scripts/browser.js exec eval "${escaped}"`, timeout);
  const match = raw.match(/### Result\n(.+)/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return match[1]; }
}

function findAndClick(text) {
  const raw = shell(`node .agents/skills/browser-automation/scripts/browser.js exec find "${text}"`, 15000);
  const refMatch = raw.match(/\[ref=([a-z0-9]+)\]/);
  if (refMatch) {
    shell(`node .agents/skills/browser-automation/scripts/browser.js exec click ${refMatch[1]}`, 10000);
    return 'clicked:' + refMatch[1];
  }
  return 'not_found';
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
  try { shell(`node scripts/db.js "${sql.replace(/"/g, '\\"')}" --write`, 10000); } catch (e) {}
}

function loadUserData() {
  const row = dbQuery("SELECT data->'profile' AS profile, data->'personal_info' AS personal, data->'job_preferences' AS prefs, data->'form_answers' AS form_answers FROM users WHERE id = 1")[0];
  return {
    profile: row?.profile || {},
    personal: row?.personal || {},
    prefs: row?.prefs || {},
    formAnswers: row?.form_answers || {},
  };
}

const USER = loadUserData();
const ANSWERS = USER.formAnswers;

function deriveKeywordsFromProfile(userData) {
  const title = userData.profile?.title;
  const skills = userData.profile?.skills || [];
  const prefs = userData.prefs || {};
  const parts = [];
  if (title) parts.push(`"${title}"`);
  const jobLikeSkills = skills.filter((s) =>
    s.match(/engineer|developer|architect|manager|lead|director|scientist|consultant/i)
  );
  const techSkills = skills.filter((s) =>
    !s.match(/engineer|developer|architect|manager|lead|director|scientist|consultant/i)
  ).slice(0, 2);
  jobLikeSkills.slice(0, 2).forEach((s) => parts.push(`"${s}"`));
  techSkills.forEach((s) => parts.push(`"${s}"`));
  if (parts.length === 0) {
    const roleTypes = prefs.role_types?.value || [];
    roleTypes.slice(0, 3).forEach((r) => parts.push(`"${r}"`));
  }
  return parts.length > 0 ? parts.join(' OR ') : 'Software Engineer';
}

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* busy wait */ }
}

// Parse args
const args = process.argv.slice(2);
let maxJobs = 50;
let keywords = deriveKeywordsFromProfile(USER);

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max' && args[i + 1]) { maxJobs = parseInt(args[i + 1], 10); i++; }
  if (args[i] === '--keywords' && args[i + 1]) { keywords = args[i + 1]; i++; }
}

// Get applied job IDs from DB
const appliedRaw = shell(`node scripts/db.js "SELECT (regexp_match(url, 'jobs/view/([0-9]+)'))[1] AS job_id FROM applications WHERE user_id = 1 AND url LIKE '%linkedin.com/jobs/view/%'" --json`, 10000);
const appliedSet = new Set();
try {
  JSON.parse(appliedRaw).forEach(r => appliedSet.add(r.job_id));
} catch (e) {}

console.log(`Already applied: ${appliedSet.size} jobs`);

// Build search URL and navigate
const searchUrl = `https://www.linkedin.com/jobs/search/?f_AL=true&f_WT=2&keywords=${encodeURIComponent(keywords)}&sortBy=DD`;
shell(`node .agents/skills/browser-automation/scripts/browser.js goto "${searchUrl}"`);
sleep(5);

// Scroll to load more jobs
evalJS(`(async function(){var container=document.querySelector('.mLyJkfqZxDoqToZDgvCJLUqrzoxqXPvqto');if(!container){var all=document.querySelectorAll('div');for(var i=0;i<all.length;i++){if(all[i].querySelector('[data-job-id]')&&all[i].scrollHeight>all[i].clientHeight+100){container=all[i];break;}}}if(!container)return 'no_container';for(var s=0;s<20;s++){container.scrollBy(0,600);await new Promise(r=>setTimeout(r,1000));}return 'scrolled, cards:'+document.querySelectorAll('[data-job-id]').length;})()`, 30000);
sleep(2);

// Get all unique job cards
const cardsResult = evalJS(`(function(){var cards=document.querySelectorAll('[data-job-id]');var jobs=[];var seen={};for(var i=0;i<cards.length;i++){var c=cards[i];var id=c.getAttribute('data-job-id');if(seen[id])continue;seen[id]=true;var t=c.innerText.split('\\n');jobs.push({id:id,title:t[0]||''});}return JSON.stringify(jobs);})()`);
const allJobs = typeof cardsResult === 'string' ? JSON.parse(cardsResult) : [];
const newJobs = allJobs.filter(j => !appliedSet.has(j.id));
console.log(`Found ${allJobs.length} jobs, ${newJobs.length} new`);

let applied = 0;
let failed = 0;
const results = [];

for (let i = 0; i < Math.min(newJobs.length, maxJobs); i++) {
  const job = newJobs[i];
  console.log(`\n[${i + 1}/${Math.min(newJobs.length, maxJobs)}] ${job.title} (${job.id})`);

  // Click the job card to load detail panel
  evalJS(`(function(){var cards=document.querySelectorAll('[data-job-id]');for(var j=0;j<cards.length;j++){if(cards[j].getAttribute('data-job-id')==='${job.id}'){var link=cards[j].querySelector('a[href*="jobs/view"]');if(link){link.click();return 'clicked';}cards[j].click();return 'clicked_card';}}return 'not_found';})()`);
  sleep(3);

  // Click Easy Apply button (must use "Easy Apply to" to avoid filter button)
  const eaResult = evalJS(`(function(){var btn=document.querySelector('button[aria-label*="Easy Apply to"]');if(btn){btn.click();return 'clicked';}return 'no_btn';})()`);
  if (eaResult !== 'clicked') {
    console.log('  SKIP: No Easy Apply');
    failed++;
    results.push({ id: job.id, title: job.title, status: 'no_button' });
    continue;
  }
  sleep(4);

  // Process form steps
  let stepApplied = false;
  for (let step = 0; step < 8; step++) {
    const r = evalJS(`(function(){var modal=null;var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){modal=all[i];break;}}if(!modal){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return JSON.stringify({done:true,applied:true});return JSON.stringify({done:true,applied:false});}var text=modal.innerText;var inputs=modal.querySelectorAll('input');var emptyInput=null;for(var j=0;j<inputs.length;j++){if(!inputs[j].value&&inputs[j].offsetHeight>0){emptyInput=inputs[j];break;}}var hasTypeahead=emptyInput&&emptyInput.id.includes('typeahead');return JSON.stringify({done:false,text:text.substring(0,800),hasTypeahead:hasTypeahead,emptyInputId:emptyInput?emptyInput.id:''});})()`);

    if (!r) { sleep(2); continue; }
    const data = typeof r === 'string' ? JSON.parse(r) : r;

    if (data.done) {
      if (data.applied) { stepApplied = true; console.log('  APPLIED'); }
      else { console.log('  FAILED: modal closed'); }
      break;
    }

    // Set phone country code from DB (personal_info.country)
    if (data.text.includes('Phone country code') || data.text.includes('Contact info')) {
      const country = USER.personal?.country || '';
      evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var selects=all[i].querySelectorAll('select');for(var j=0;j<selects.length;j++){if(selects[j].options.length>50){for(var k=0;k<selects[j].options.length;k++){if(selects[j].options[k].text.includes('${country}')){selects[j].selectedIndex=k;selects[j].dispatchEvent(new Event('change',{bubbles:true}));break;}}}break;}break;}}return 'done';})()`);
      sleep(1);
    }

    // Handle typeahead location field (from DB form_answers.location or personal_info.city)
    if (data.hasTypeahead) {
      const city = ANSWERS.location || USER.personal?.city || '';
      // Clear and type
      evalJS(`(function(){var inp=document.getElementById('${data.emptyInputId}');if(!inp)return 'no_input';var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;ns.call(inp,'');inp.dispatchEvent(new Event('input',{bubbles:true}));ns.call(inp,'${city}');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()`);
      sleep(3);
      // Select first matching option from dropdown
      const cityShort = city.split(',')[0].substring(0, 18);
      evalJS(`(function(){var options=document.querySelectorAll('[role=option]');for(var i=0;i<options.length;i++){if(options[i].innerText.includes('${cityShort}')){options[i].click();return 'selected:'+options[i].innerText.substring(0,40);}}return 'no_option';})()`);
      sleep(2);
    }

    // Fill text inputs from DB form_answers (years of experience, salary, etc.)
    if (data.text.includes('Additional Questions') || data.text.includes('years')) {
      const awsExp = ANSWERS.aws_experience || '';
      const engExp = ANSWERS.engineering_experience || ANSWERS.years_of_experience || '';
      const pyExp = ANSWERS.python_experience || '';
      const salary = ANSWERS.salary_usd ? (ANSWERS.salary_usd_max ? `${ANSWERS.salary_usd}-${ANSWERS.salary_usd_max} USD/month` : `${ANSWERS.salary_usd} USD/month`) : '';
      const notice = ANSWERS.notice_period || '';
      evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var inputs=all[i].querySelectorAll('input[type=text]');var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;inputs.forEach(function(inp){if(!inp.value&&inp.offsetHeight>0){var ctx=inp.parentElement.parentElement.innerText.toLowerCase();if(ctx.includes('aws')||ctx.includes('amazon')){if('${awsExp}'){ns.call(inp,'${awsExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('engineering')||(ctx.includes('years')&&ctx.includes('experience'))){if('${engExp}'){ns.call(inp,'${engExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('python')){if('${pyExp}'){ns.call(inp,'${pyExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('salary')||ctx.includes('compensation')){if('${salary}'){ns.call(inp,'${salary}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('notice')||ctx.includes('availability')){if('${notice}'){ns.call(inp,'${notice}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}});break;}}return 'done';})()`);
      sleep(1);
    }

    // Handle radios
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var radios=all[i].querySelectorAll('input[type=radio]');var groups={};radios.forEach(function(r){var n=r.name;if(!groups[n])groups[n]=[];groups[n].push(r);});Object.keys(groups).forEach(function(n){var opts=groups[n].map(function(r){return r.value.toLowerCase();});if(opts.includes('yes')&&opts.includes('no')){groups[n].forEach(function(r){if(r.value.toLowerCase()==='yes')r.click();});}});break;}}return 'done';})()`);
    sleep(1);

    // Handle checkboxes
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var cbs=all[i].querySelectorAll('input[type=checkbox]');cbs.forEach(function(cb){if(!cb.checked)cb.click();});break;}}return 'done';})()`);
    sleep(1);

    // Submit if review page
    if (data.text.toLowerCase().includes('review your application')) {
      evalJS(`(function(){var modal=null;var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){modal=all[i];break;}}if(!modal)return 'no_modal';var btns=modal.querySelectorAll('button');for(var i=0;i<btns.length;i++){var aria=btns[i].getAttribute('aria-label')||'';if(aria.includes('Submit application')&&!btns[i].disabled){btns[i].click();return 'submitted';}}return 'no_submit';})()`);
      sleep(5);
      const verify = evalJS(`(function(){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return 'applied';return 'not_applied';})()`);
      if (verify === 'applied') { stepApplied = true; console.log('  APPLIED'); }
      else { console.log('  Submit failed: ' + verify); }
      break;
    }

    // Click Next/Review/Submit using eval (find by aria-label)
    const navResult = evalJS(`(function(){var modal=null;var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){modal=all[i];break;}}if(!modal)return 'no_modal';var btns=modal.querySelectorAll('button');for(var i=0;i<btns.length;i++){var aria=btns[i].getAttribute('aria-label')||'';var text=btns[i].textContent.trim().toLowerCase();if(!btns[i].disabled&&btns[i].offsetHeight>0){if(aria.includes('Continue to next step')||text==='next'||text==='siguiente'){btns[i].click();return 'next';}if(aria.includes('Review your application')||text==='review'){btns[i].click();return 'review';}if(aria.includes('Submit application')||text.includes('submit')){btns[i].click();return 'submit';}}}return 'no_button';})()`);

    if (navResult === 'submit') {
      sleep(5);
      const verify = evalJS(`(function(){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return 'applied';return 'not_applied';})()`);
      if (verify === 'applied') { stepApplied = true; console.log('  APPLIED'); }
      else { console.log('  Submit failed'); }
      break;
    }

    if (navResult === 'no_button' || navResult === 'no_modal') {
      console.log('  No nav button found: ' + navResult);
      break;
    }
    sleep(4);
  }

  if (stepApplied) {
    applied++;
    const safeTitle = job.title.replace(/'/g, "''");
    dbWrite(`INSERT INTO applications (user_id, platform, company, role, url, status, applied_at, data) VALUES (1, 'linkedin', '', '${safeTitle}', 'https://www.linkedin.com/jobs/view/${job.id}/', 'applied', NOW(), '{"source": "search_apply"}')`);
    results.push({ id: job.id, title: job.title, status: 'applied' });
  } else {
    failed++;
    results.push({ id: job.id, title: job.title, status: 'failed' });
  }

  // Close any open modal
  evalJS(`(function(){var btn=document.querySelector('button[aria-label="Dismiss"]');if(btn)btn.click();return 'done';})()`);
  sleep(2);
}

console.log(`\n=== SUMMARY ===`);
console.log(`Applied: ${applied}`);
console.log(`Failed: ${failed}`);
results.filter(r => r.status === 'applied').forEach(r => console.log(`  OK: ${r.title} (${r.id})`));
results.filter(r => r.status !== 'applied').forEach(r => console.log(`  SKIP: ${r.title} (${r.id}) - ${r.status}`));

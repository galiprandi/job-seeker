#!/usr/bin/env node
/**
 * easy-apply-one.js — Apply to a single LinkedIn job via Easy Apply.
 * Usage: node scripts/easy-apply-one.js <jobId> <jobTitle>
 * Returns JSON: { status: "applied"|"failed"|"no_button"|"captcha", ... }
 *
 * Form data (country, salary, city, years of experience, etc.) is read from DB
 * at runtime (users.data.form_answers + users.data.personal_info). Never hardcoded.
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

function dbQuery(sql) {
  try {
    return JSON.parse(
      execSync(`node ${__dirname}/db.js "${sql.replace(/"/g, '\\"')}"`, {
        encoding: 'utf8', timeout: 15000, cwd: __dirname,
      })
    );
  } catch (e) { return []; }
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
  execSync(`sleep ${Math.ceil(ms / 1000)}`, { timeout: ms + 5000 });
}

const jobId = process.argv[2];
const jobTitle = process.argv[3] || '';

if (!jobId) {
  console.error('Usage: node scripts/easy-apply-one.js <jobId> [jobTitle]');
  process.exit(1);
}

// Navigate
shell(`node .agents/skills/browser-automation/scripts/browser.js goto "https://www.linkedin.com/jobs/view/${jobId}/"`);
sleep(3);

// Click Easy Apply
const click = evalJS(`(function(){var btn=document.querySelector('button[aria-label*="Easy Apply"], button[aria-label*="Solicitud sencilla"]');if(!btn){var all=document.querySelectorAll('button');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Easy Apply')||all[i].textContent.includes('Solicitud sencilla')){btn=all[i];break;}}}if(btn){btn.click();return 'clicked';}return 'no_btn';})()`);

if (click !== 'clicked') {
  console.log(JSON.stringify({ status: 'no_button', jobId, jobTitle }));
  process.exit(0);
}

sleep(4);

// Process steps
for (let step = 0; step < 8; step++) {
  const result = evalJS(`(function(){var modal=null;var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){modal=all[i];break;}}if(!modal){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return JSON.stringify({done:true,applied:true});return JSON.stringify({done:true,applied:false});}var text=modal.innerText;var pageMatch=text.match(/(\\d+)\\/(\\d+)\\s*pages/);return JSON.stringify({done:false,page:pageMatch?pageMatch[1]:'?',text:text.substring(0,1500)});})()`);

  if (!result) { sleep(2); continue; }
  const r = typeof result === 'string' ? JSON.parse(result) : result;

  if (r.done) {
    console.log(JSON.stringify({ status: r.applied ? 'applied' : 'failed', jobId, jobTitle }));
    process.exit(0);
  }

  console.error(`Page ${r.page}: ${r.text.substring(0, 80).replace(/\n/g, ' ')}`);

  // Set phone country code from DB (personal_info.country)
  if (r.text.includes('Phone country code') || r.text.includes('Contact info')) {
    const country = USER.personal?.country || '';
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var selects=all[i].querySelectorAll('select');for(var j=0;j<selects.length;j++){if(selects[j].options.length>50){for(var k=0;k<selects[j].options.length;k++){if(selects[j].options[k].text.includes('${country}')){selects[j].selectedIndex=k;selects[j].dispatchEvent(new Event('change',{bubbles:true}));break;}}}break;}break;}}return 'done';})()`);
    sleep(1);
  }

  // Fill text inputs from DB form_answers
  if (r.text.includes('Additional Questions') || r.text.includes('years') || r.text.includes('experience')) {
    const awsExp = ANSWERS.aws_experience || '';
    const engExp = ANSWERS.engineering_experience || ANSWERS.years_of_experience || '';
    const pyExp = ANSWERS.python_experience || '';
    const salary = ANSWERS.salary_usd ? (ANSWERS.salary_usd_max ? `${ANSWERS.salary_usd}-${ANSWERS.salary_usd_max} USD/month` : `${ANSWERS.salary_usd} USD/month`) : '';
    const city = ANSWERS.location || USER.personal?.city || '';
    const notice = ANSWERS.notice_period || '';
    evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var inputs=all[i].querySelectorAll('input[type=text]');var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;inputs.forEach(function(inp){if(inp.value===''){var ctx=inp.parentElement.parentElement.innerText.toLowerCase();if(ctx.includes('aws')||ctx.includes('amazon')){if('${awsExp}'){ns.call(inp,'${awsExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('engineering')||ctx.includes('years of')&&ctx.includes('experience')){if('${engExp}'){ns.call(inp,'${engExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('python')){if('${pyExp}'){ns.call(inp,'${pyExp}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('salary')||ctx.includes('compensation')){if('${salary}'){ns.call(inp,'${salary}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('city')){if('${city}'){ns.call(inp,'${city}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}else if(ctx.includes('notice')||ctx.includes('availability')){if('${notice}'){ns.call(inp,'${notice}');inp.dispatchEvent(new Event('input',{bubbles:true}));}}});break;}}return 'done';})()`);
    sleep(1);
  }

  // Handle radios: answer Yes to work authorization, sponsorship etc.
  evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var radios=all[i].querySelectorAll('input[type=radio]');var groups={};radios.forEach(function(r){var n=r.name||'g'+r.value;if(!groups[n])groups[n]=[];groups[n].push(r);});Object.keys(groups).forEach(function(n){var opts=groups[n].map(function(r){return r.value.toLowerCase();});if(opts.includes('yes')&&opts.includes('no')){groups[n].forEach(function(r){if(r.value.toLowerCase()==='yes')r.click();});}});break;}}return 'done';})()`);
  sleep(1);

  // Handle checkboxes
  evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var cbs=all[i].querySelectorAll('input[type=checkbox]');cbs.forEach(function(cb){if(!cb.checked)cb.click();});break;}}return 'done';})()`);
  sleep(1);

  // Check for captcha
  if (r.text.toLowerCase().includes('captcha') || r.text.toLowerCase().includes('verification')) {
    console.log(JSON.stringify({ status: 'captcha', jobId, jobTitle }));
    process.exit(0);
  }

  // Submit if review page
  if (r.text.toLowerCase().includes('review your application')) {
    evalJS(`(function(){var buttons=document.querySelectorAll('button');for(var i=0;i<buttons.length;i++){var t=buttons[i].textContent.trim().toLowerCase();if(t.includes('submit application')||t.includes('submit')){buttons[i].click();return 'clicked:'+t;}}return 'no_submit';})()`);
    sleep(4);
    const verify = evalJS(`(function(){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return 'applied';return 'not_applied:'+t.substring(0,200);})()`);
    const applied = verify === 'applied' || (verify && verify.includes('applied'));
    console.log(JSON.stringify({ status: applied ? 'applied' : 'failed', jobId, jobTitle }));
    process.exit(0);
  }

  // Click Next/Review - find the right button
  const nextResult = evalJS(`(function(){var all=document.querySelectorAll('div,section,form');for(var i=0;i<all.length;i++){if(all[i].textContent.includes('Apply to')&&all[i].offsetHeight>100){var buttons=all[i].querySelectorAll('button');for(var j=0;j<buttons.length;j++){var t=buttons[j].textContent.trim().toLowerCase();if((t.includes('next')||t.includes('review')||t.includes('siguiente'))&&!buttons[j].disabled){buttons[j].click();return 'clicked:'+t;}}break;}}return 'no_next';})()`);

  if (nextResult === 'no_next' || !nextResult) {
    // Try submit
    const submitResult = evalJS(`(function(){var buttons=document.querySelectorAll('button');for(var i=0;i<buttons.length;i++){var t=buttons[i].textContent.trim().toLowerCase();if(t.includes('submit')&&!buttons[i].disabled){buttons[j].click();return 'clicked:'+t;}}return 'no_submit';})()`);
    sleep(4);
    const verify = evalJS(`(function(){var t=document.body.innerText;if(t.includes('Application submitted')||t.includes('was sent'))return 'applied';return 'not_applied';})()`);
    console.log(JSON.stringify({ status: verify === 'applied' ? 'applied' : 'failed', jobId, jobTitle }));
    process.exit(0);
  }

  sleep(4);
}

console.log(JSON.stringify({ status: 'failed', jobId, jobTitle, reason: 'max_steps' }));

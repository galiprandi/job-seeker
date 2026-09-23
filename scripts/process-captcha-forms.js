#!/usr/bin/env node
/**
 * process-captcha-forms.js — Open each captcha form in a new tab, fill it, click submit.
 * Leaves tabs open for user to solve captchas manually.
 */
const { execSync } = require('child_process');

const BROWSER = 'node .agents/skills/browser-automation/scripts/browser.js';
const CV_PATH = '/home/galiprandi/Documents/Germán Aliprandi.pdf';

const forms = [
  { name: 'crowdar', url: 'https://crowdar.peopleforce.io/careers/v/208792-sumate-a-nuestra-base-de-datos/a/new?source_id=51266',
    fill: async (tab) => {
      const snap = execSync(`${BROWSER} exec snapshot --tab ${tab}`, {encoding:'utf8',timeout:15000});
      const refs = {};
      ['Nombre completo', 'Correo', 'Números de teléfono', 'Linkedin', 'Aplicar', 'Currículum'].forEach(label => {
        const m = snap.match(new RegExp(`ref=(e\\d+)[^\\n]*${label}`));
        if (m) refs[label] = m[1];
      });
      if (refs['Nombre completo']) execSync(`${BROWSER} exec fill ${refs['Nombre completo']} "Germán Aliprandi" --tab ${tab}`, {encoding:'utf8',timeout:15000});
      if (refs['Correo']) execSync(`${BROWSER} exec fill ${refs['Correo']} "galiprandi@gmail.com" --tab ${tab}`, {encoding:'utf8',timeout:15000});
      if (refs['Números de teléfono']) execSync(`${BROWSER} exec fill ${refs['Números de teléfono']} "+5493816187329" --tab ${tab}`, {encoding:'utf8',timeout:15000});
      if (refs['Linkedin']) execSync(`${BROWSER} exec fill ${refs['Linkedin']} "https://www.linkedin.com/in/galiprandi/" --tab ${tab}`, {encoding:'utf8',timeout:15000});
      // Cover letter + custom fields via eval
      execSync(`${BROWSER} exec eval --tab ${tab} "(function(){
        var editor = document.querySelector('.note-editable, [contenteditable=true], .ql-editor');
        if (editor) { editor.innerHTML = 'Software Engineer con 25+ años de experiencia. SDLC optimization, AI Strategy. Busco oportunidades remotas. CV: https://galiprandi.github.io/me/'; editor.dispatchEvent(new Event('input', {bubbles:true})); }
        var r = document.querySelector('[name=\\\"career_application_form[field_store][data][314257]\\\"]'); if (r) { r.value='Engineering Manager'; r.dispatchEvent(new Event('input',{bubbles:true})); }
        var h = document.querySelector('[name=\\\"career_application_form[field_store][data][310452]\\\"]'); if (h) { h.value='LinkedIn'; h.dispatchEvent(new Event('input',{bubbles:true})); }
        return 'done';
      })()"`, {encoding:'utf8',timeout:15000});
      // Upload CV
      if (refs['Currículum']) {
        try {
          execSync(`${BROWSER} exec click ${refs['Currículum']} --tab ${tab} &`, {encoding:'utf8',timeout:5000});
          setTimeout(() => {}, 1000);
          execSync(`playwright-cli -s=default upload '${CV_PATH}'`, {encoding:'utf8',timeout:10000});
        } catch(e) { console.error('CV upload failed for ' + tab); }
      }
      // Click submit
      if (refs['Aplicar']) execSync(`${BROWSER} exec click ${refs['Aplicar']} --tab ${tab}`, {encoding:'utf8',timeout:15000});
    }
  },
  { name: 'axonier', url: 'https://axonier.com/trabaja-con-nosotros/',
    fill: async (tab) => {
      const snap = execSync(`${BROWSER} exec snapshot --tab ${tab}`, {encoding:'utf8',timeout:15000});
      const emailRef = snap.match(/ref=(e\d+)[^\n]*Email/)?.[1];
      const cvRef = snap.match(/ref=(e\d+)[^\n]*Choose file/)?.[1];
      const sendRef = snap.match(/ref=(e\d+)[^\n]*Enviar/)?.[1];
      if (emailRef) execSync(`${BROWSER} exec fill ${emailRef} "galiprandi@gmail.com" --tab ${tab}`, {encoding:'utf8',timeout:15000});
      if (cvRef) {
        try {
          execSync(`${BROWSER} exec click ${cvRef} --tab ${tab} &`, {encoding:'utf8',timeout:5000});
          setTimeout(() => {}, 1000);
          execSync(`playwright-cli -s=default upload '${CV_PATH}'`, {encoding:'utf8',timeout:10000});
        } catch(e) { console.error('CV upload failed for ' + tab); }
      }
      if (sendRef) execSync(`${BROWSER} exec click ${sendRef} --tab ${tab}`, {encoding:'utf8',timeout:15000});
    }
  },
  { name: 'b2cloud', url: 'https://b2cloud.tech/rrhh',
    fill: async (tab) => {
      const snap = execSync(`${BROWSER} exec snapshot --tab ${tab}`, {encoding:'utf8',timeout:15000});
      const refs = {};
      ['Nombre.*obligatorio', 'Apellido.*obligatorio', 'Edad.*obligatorio', 'Correo.*obligatorio', 'País.*obligatorio', 'Experiencia.*obligatorio', 'Educación.*obligatorio', 'Idiomas.*obligatorio', 'Contanos.*obligatorio', 'Enviar'].forEach(label => {
        const m = snap.match(new RegExp(`ref=(e\\d+)[^\\n]*${label}`));
        if (m) refs[label.split('.')[0]] = m[1];
      });
      const fill = (ref, val) => ref ? execSync(`${BROWSER} exec fill ${ref} "${val.replace(/"/g,'\\"')}" --tab ${tab}`, {encoding:'utf8',timeout:15000}) : null;
      fill(refs['Nombre'], 'Germán');
      fill(refs['Apellido'], 'Aliprandi');
      fill(refs['Edad'], '42');
      fill(refs['Correo'], 'galiprandi@gmail.com');
      fill(refs['País'], 'Argentina');
      fill(refs['Experiencia'], '25+ años Software Engineering, EM en Egg Live, SDLC en Cencosud');
      fill(refs['Educación'], "Technical Bachelor's in Electronics");
      fill(refs['Idiomas'], 'Spanish (native), English (B2)');
      fill(refs['Contanos'], 'Software Engineer 25+ años. SDLC optimization, AI Strategy. Busco remoto. CV: https://galiprandi.github.io/me/');
      if (refs['Enviar']) execSync(`${BROWSER} exec click ${refs['Enviar']} --tab ${tab}`, {encoding:'utf8',timeout:15000});
    }
  },
  { name: 'grit', url: 'https://grit.zohorecruit.com/jobs/grit',
    fill: async (tab) => {
      // ZohoRecruit - needs registration first, just leave the page open
      console.log('GRIT: ZohoRecruit portal - needs manual registration');
    }
  },
  { name: 'icsred', url: 'https://icsred.com/rrhh',
    fill: async (tab) => {
      console.log('ICSRED: Opening form for manual fill + captcha');
    }
  },
  { name: 'ketos', url: 'https://ketos-delphin.com/talentos/',
    fill: async (tab) => {
      console.log('KETOS: Opening form for manual fill + captcha');
    }
  },
  { name: 'nextvision', url: 'https://nextvision.com/sumate-a-nv/',
    fill: async (tab) => {
      console.log('NEXTVISION: Opening form for manual fill + captcha');
    }
  },
  { name: 'tmob', url: 'https://www.t-mobs.com/sumate-a-t-mob/',
    fill: async (tab) => {
      console.log('T-MOB: Opening form for manual fill + captcha');
    }
  },
  { name: 'tecnosoftware', url: 'https://tecnosoftware.com/sumate/',
    fill: async (tab) => {
      console.log('TECNOSOFTWARE: Opening form for manual fill + captcha');
    }
  },
  { name: 'banksa', url: 'https://www.banksa.com.ar/index.php/contacto-rrhh/',
    fill: async (tab) => {
      console.log('BANKSA: Opening form for manual fill + captcha');
    }
  },
  { name: 'danaide', url: 'https://danaide.com.ar/es/sumate-a-nuestro-equipo/',
    fill: async (tab) => {
      console.log('DANAIDE: Opening form for manual fill + captcha');
    }
  },
  { name: 'emm', url: 'https://www.emmsa.net/rrhh/',
    fill: async (tab) => {
      console.log('EMM: Opening form for manual fill + captcha');
    }
  },
  { name: 'gylgroup', url: 'https://www.gylgroup.com/trabaja-con-nosotros/',
    fill: async (tab) => {
      console.log('G&L GROUP: Opening form for manual fill + captcha');
    }
  },
  { name: 'gpc', url: 'https://www.gpc-sa.com.ar/trabaja-con-nosotros/',
    fill: async (tab) => {
      console.log('GPC: Opening form for manual fill + captcha');
    }
  },
  { name: 'fusap', url: 'https://fusap.com.ar/es/tendiendo-puentes-entre-la-educacion-y-el-desarrollo-de-jovenes-talentos/',
    fill: async (tab) => {
      console.log('FUSAP: Opening form for manual fill + captcha');
    }
  }
];

async function main() {
  for (const form of forms) {
    console.log(`\n=== Processing ${form.name} ===`);
    try {
      // Open new tab
      execSync(`${BROWSER} tab-new "${form.url}" --name ${form.name}`, {encoding:'utf8',timeout:30000});
      console.log(`Opened tab: ${form.name}`);
      // Wait for page load
      await new Promise(r => setTimeout(r, 3000));
      // Fill form
      if (form.fill) {
        try {
          await form.fill(form.name);
          console.log(`Form filled: ${form.name}`);
        } catch(e) {
          console.error(`Fill error for ${form.name}: ${e.message?.substring(0,100)}`);
        }
      }
      // Check if captcha appeared
      try {
        const result = execSync(`${BROWSER} exec eval --tab ${form.name} "(function(){
          var c = document.querySelector('.g-recaptcha, [data-sitekey], iframe[src*=recaptcha], iframe[src*=hcaptcha]');
          var s = document.body.innerText.match(/gracias|exitos|enviado|success|received/i);
          return 'captcha=' + (c ? 'present' : 'not found') + ' success=' + (s ? s[0] : 'none');
        })()"`, {encoding:'utf8',timeout:15000});
        console.log(`Status: ${result.match(/Result.*\n.*"(.+?)"/)?.[1] || result.substring(0,100)}`);
      } catch(e) {
        console.error(`Status check error: ${e.message?.substring(0,100)}`);
      }
    } catch(e) {
      console.error(`Failed to process ${form.name}: ${e.message?.substring(0,100)}`);
    }
  }
  console.log('\n=== All tabs opened ===');
  console.log('Resolve captchas in each tab, then close them manually.');
}

main().catch(console.error);

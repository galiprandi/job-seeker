#!/usr/bin/env node
/**
 * gmail-batch-send.js — Send emails via Gmail UI in the browser
 * Usage: node scripts/gmail-batch-send.js --emails '{"to":"email","subject":"subj","body":"body"}' ...
 */
const { execSync } = require('child_process');

const BROWSER = 'node .agents/skills/browser-automation/scripts/browser.js';

function shell(cmd, timeout = 30000) {
  try { return execSync(cmd, { encoding: 'utf8', timeout, cwd: process.cwd() }); }
  catch (e) { return e.stdout || e.message; }
}

function evalJS(js, timeout = 20000) {
  const escaped = js.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  const raw = shell(`${BROWSER} exec eval "${escaped}"`, timeout);
  const match = raw.match(/### Result\n(.+)/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return match[1]; }
}

function sendEmail(to, subject, body) {
  // Build Gmail compose URL
  const params = new URLSearchParams({
    view: 'cm', fs: '1', to, su: subject, body
  });
  const url = `https://mail.google.com/mail/?${params.toString()}`;

  // Navigate to compose
  shell(`${BROWSER} goto "${url}" --tab default`, 30000);

  // Wait for body to load
  let attempts = 0;
  let loaded = false;
  while (attempts < 10 && !loaded) {
    const result = evalJS(`(async function(){
      await new Promise(function(r){setTimeout(r, 2000)});
      var body = document.querySelector('.Am.Al, .LW-avI, [contenteditable=true]');
      return body && body.innerText.length > 10 ? 'loaded' : 'waiting';
    })()`, 15000);
    if (result === 'loaded') loaded = true;
    attempts++;
  }

  if (!loaded) {
    console.error(`Failed to load compose for ${to}`);
    return false;
  }

  // Find and click send button
  const snapshot = shell(`${BROWSER} exec snapshot`, 15000);
  const sendMatch = snapshot.match(/\[ref=([a-z0-9]+)\][^\n]*Enviar/);
  if (sendMatch) {
    shell(`${BROWSER} exec click ${sendMatch[1]}`, 10000);
    // Wait for send
    evalJS(`(async function(){ await new Promise(function(r){setTimeout(r, 3000)}); return 'sent'; })()`, 10000);
    console.log(`Sent to ${to}`);
    return true;
  } else {
    console.error(`No send button found for ${to}`);
    return false;
  }
}

// Parse emails from command line or from a file
const args = process.argv.slice(2);
let emails = [];

if (args.includes('--file')) {
  const file = args[args.indexOf('--file') + 1];
  emails = JSON.parse(require('fs').readFileSync(file, 'utf8'));
} else if (args.includes('--json')) {
  emails = JSON.parse(args[args.indexOf('--json') + 1]);
}

const subject = 'Consulta sobre oportunidades laborales - Software Engineer / AI Strategy Architect';
const body = `Hola,

Me pongo en contacto para expresar mi interés en formar parte de su equipo. Soy Software Engineer con más de 25 años de experiencia, especializado en optimización del SDLC y estrategias de IA.

Actualmente trabajo en Cencosud S.A. liderando workflows Agent-First para el SDLC, con resultados de 2x-3x faster time-to-market y 75% de reducción de costos operativos. Anteriormente fui Engineering Manager en Egg Live, donde mentoré a más de 30 developers y escalé la plataforma a 50x usuarios concurrentes.

Mi perfil combina liderazgo técnico, arquitectura de software, integración de LLMs y AI agents en procesos de desarrollo, y contribuciones open source (fastify-lm, Axioma, @galiprandi/react-tools).

Estoy abierto a oportunidades remotas en roles de Engineering Manager, AI Strategy Architect o Senior Software Engineer. Mi CV: https://galiprandi.github.io/me/

Agradezco su tiempo y quedo a disposición.

Saludos,
Germán Aliprandi
https://github.com/galiprandi
https://www.linkedin.com/in/galiprandi/`;

// If emails passed as array of {to, subject?, body?}
for (const email of emails) {
  const to = typeof email === 'string' ? email : email.to;
  const subj = email.subject || subject;
  const bdy = email.body || body;
  sendEmail(to, subj, bdy);
  // Small delay between sends
  execSync('sleep 2');
}

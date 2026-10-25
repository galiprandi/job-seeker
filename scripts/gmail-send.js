#!/usr/bin/env node
/**
 * gmail-send.js — Send emails via Gmail web interface with CV attached.
 *
 * Uses agent-browser via the browser.js wrapper (browser must be running first).
 * Opens Gmail compose dialog, fills fields, attaches CV, sends.
 *
 * Usage:
 *   node .agents/skills/browser-automation/scripts/browser.js open "https://mail.google.com"   # ensure Gmail session
 *   node scripts/gmail-send.js --to email@example.com --subject "Subject" --body "Body text"
 *   node scripts/gmail-send.js --to email@example.com --subject "Subject" --body-file body.txt
 *   node scripts/gmail-send.js --to email@example.com --subject "Subject" --body "Body" --no-cv
 *   node scripts/gmail-send.js --to email1@a.com,email2@b.com --subject "Subject" --body "Body"
 *
 * Flags:
 *   --to <emails>       Comma-separated recipient emails (required)
 *   --subject <text>    Email subject (required)
 *   --body <text>       Email body text (required if no --body-file)
 *   --body-file <path>  Read body from file
 *   --cv <path>         CV file to attach (default: from DB profile.cv_path or personal_info.cv_pdf_path)
 *   --no-cv             Don't attach CV
 *   --cc <emails>       CC recipients
 *   --bcc <emails>      BCC recipients
 *   --session <name>    Browser session name (default: "default". Use a different name for parallel agents)
 *
 * Exit codes:
 *   0 = email sent
 *   1 = send failed
 *   2 = browser not running / error / missing args
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const BROWSER_JS = path.join(REPO_ROOT, '.agents', 'skills', 'browser-automation', 'scripts', 'browser.js');

let SESSION = 'default';

function cli(args, timeout = 30000) {
  try {
    return execSync(`node "${BROWSER_JS}" exec ${args} --session ${SESSION}`, {
      encoding: 'utf-8',
      timeout,
      cwd: REPO_ROOT,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function snapshot() {
  return cli('snapshot');
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function click(ref) {
  return cli(`click ${ref}`);
}

function fill(ref, value) {
  return cli(`fill ${ref} "${value.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
}

function goto(url) {
  // exec navigate forwards --session; wrapper `goto` does not.
  cli(`navigate "${url}"`);
}

function dbWrite(sql) {
  try {
    return execSync(`node ${__dirname}/db.js "${sql.replace(/"/g, '\\"')}" --write`, {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: __dirname,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function extractRef(text, pattern) {
  const match = text.match(pattern);
  return match ? match[1] : null;
}

function loadCvPathFromDB() {
  try {
    const output = execSync(
      `node ${__dirname}/db.js "SELECT data->'profile'->>'cv_path' AS cv_path, data->'personal_info'->>'cv_pdf_path' AS cv_pdf FROM users WHERE id = ${process.env.USER_ID || 1}"`,
      { encoding: 'utf-8', timeout: 15000, cwd: __dirname }
    );
    const rows = JSON.parse(output);
    return rows[0]?.cv_path || rows[0]?.cv_pdf || null;
  } catch (e) {
    return null;
  }
}

function main() {
  const args = process.argv.slice(2);

  let to = null, subject = null, body = null, bodyFile = null;
  let cvPath = loadCvPathFromDB(), noCv = false;
  let cc = null, bcc = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i + 1]) { to = args[i + 1]; i++; }
    else if (args[i] === '--subject' && args[i + 1]) { subject = args[i + 1]; i++; }
    else if (args[i] === '--body' && args[i + 1]) { body = args[i + 1]; i++; }
    else if (args[i] === '--body-file' && args[i + 1]) { bodyFile = args[i + 1]; i++; }
    else if (args[i] === '--cv' && args[i + 1]) { cvPath = args[i + 1]; i++; }
    else if (args[i] === '--no-cv') noCv = true;
    else if (args[i] === '--cc' && args[i + 1]) { cc = args[i + 1]; i++; }
    else if (args[i] === '--bcc' && args[i + 1]) { bcc = args[i + 1]; i++; }
    else if (args[i] === '--session' && args[i + 1]) { SESSION = args[i + 1]; i++; }
  }

  // Validate required args
  if (!to || !subject) {
    console.error('Error: --to and --subject are required');
    console.error('Usage: node scripts/gmail-send.js --to <emails> --subject <text> --body <text> [--cv <path>] [--no-cv]');
    process.exit(2);
  }

  // Load body from file if specified
  if (bodyFile) {
    try {
      body = fs.readFileSync(bodyFile, 'utf-8');
    } catch (e) {
      console.error(`Error reading body file: ${bodyFile}`);
      process.exit(2);
    }
  }

  if (!body) {
    console.error('Error: --body or --body-file is required');
    process.exit(2);
  }

  // Navigate to Gmail inbox
  goto('https://mail.google.com/mail/u/0/#inbox');
  sleep(5000);

  // Click "Redactar" (Compose) button
  let snap = snapshot();
  const composeRef = extractRef(snap, /(@e\d+) \[button\] "Redactar"/);
  if (!composeRef) {
    // Try English UI
    const composeRefEn = extractRef(snap, /(@e\d+) \[button\] "Compose"/);
    if (!composeRefEn) {
      console.error('Error: Compose button not found. Is Gmail loaded?');
      process.exit(2);
    }
    click(composeRefEn);
  } else {
    click(composeRef);
  }
  sleep(3000);

  // Get compose dialog refs
  snap = snapshot();

  const toRef = extractRef(snap, /(@e\d+) \[combobox\] "Destinatarios"/)
    || extractRef(snap, /(@e\d+) \[combobox\] "To"/);
  const subjectRef = extractRef(snap, /(@e\d+) \[textbox\] "Asunto"/)
    || extractRef(snap, /(@e\d+) \[textbox\] "Subject"/);
  const bodyRef = extractRef(snap, /(@e\d+) \[textbox\] "Cuerpo del mensaje"/)
    || extractRef(snap, /(@e\d+) \[textbox\] "Message body"/);
  const attachRef = extractRef(snap, /(@e\d+) \[button\] "Adjuntar archivos"/)
    || extractRef(snap, /(@e\d+) \[button\] "Attach files"/);
  const sendRef = extractRef(snap, /(@e\d+) \[button\] "Enviar[^"]*"/)
    || extractRef(snap, /(@e\d+) \[button\] "Send[^"]*"/);

  if (!toRef || !subjectRef || !bodyRef || !sendRef) {
    console.error('Error: Could not find compose dialog fields.');
    console.error(`to=${toRef}, subject=${subjectRef}, body=${bodyRef}, send=${sendRef}`);
    process.exit(2);
  }

  // Fill "To" field (handle multiple recipients)
  fill(toRef, to);
  sleep(1000);

  // Add CC if specified
  if (cc) {
    const ccLink = extractRef(snap, /(@e\d+) \[link\] "Añadir destinatarios a .Cc.[^"]*"/)
      || extractRef(snap, /(@e\d+) \[link\] "Add Cc recipients[^"]*"/);
    if (ccLink) {
      click(ccLink);
      sleep(1000);
      snap = snapshot();
      const ccRef = extractRef(snap, /(@e\d+) \[combobox\] "Cc"/);
      if (ccRef) fill(ccRef, cc);
      sleep(1000);
    }
  }

  // Add BCC if specified
  if (bcc) {
    const bccLink = extractRef(snap, /(@e\d+) \[link\] "Añadir destinatarios a .Cco.[^"]*"/)
      || extractRef(snap, /(@e\d+) \[link\] "Add Bcc recipients[^"]*"/);
    if (bccLink) {
      click(bccLink);
      sleep(1000);
      snap = snapshot();
      const bccRef = extractRef(snap, /(@e\d+) \[combobox\] "Cco"/)
        || extractRef(snap, /(@e\d+) \[combobox\] "Bcc"/);
      if (bccRef) fill(bccRef, bcc);
      sleep(1000);
    }
  }

  // Fill subject
  fill(subjectRef, subject);
  sleep(1000);

  // Fill body
  fill(bodyRef, body);
  sleep(1000);

  // Attach CV if not disabled
  if (!noCv && cvPath && fs.existsSync(cvPath)) {
    {
      // agent-browser upload targets the file input directly — no need to
      // click the attach button first (that would open a native file chooser).
      cli(`upload 'input[type="file"]' "${cvPath}"`, 15000);
      sleep(3000);

      // Verify attachment
      snap = snapshot();
      const fileName = path.basename(cvPath);
      if (snap.includes(fileName) || snap.includes('archivo adjunto')) {
        console.log(`CV attached: ${fileName}`);
      } else {
        console.error('Warning: CV attachment may have failed');
      }
    }
  } else if (!noCv && cvPath && !fs.existsSync(cvPath)) {
    console.error(`Warning: CV file not found at ${cvPath}, sending without attachment`);
  }

  // Send
  click(sendRef);
  sleep(3000);

  // Verify sent
  snap = snapshot();
  if (snap.includes('Mensaje enviado') || snap.includes('Message sent')) {
    console.log(`Email sent to: ${to}`);
    console.log(`Subject: ${subject}`);
    process.exit(0);
  } else {
    console.error('Error: Could not confirm email was sent');
    process.exit(1);
  }
}

main();

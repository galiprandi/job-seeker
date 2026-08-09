#!/usr/bin/env node
/**
 * send-email.js — Send an email via SMTP.
 *
 * Reads SMTP credentials from .env:
 *   SMTP_HOST (default: smtp.gmail.com)
 *   SMTP_PORT (default: 465)
 *   SMTP_SECURE (default: true)
 *   SMTP_USER (your email address)
 *   SMTP_PASS (app password, never your regular password)
 *
 * Usage:
 *   node scripts/send-email.js --to someone@example.com --subject "Hi" --body "Hello"
 *
 * Optional:
 *   --from "Your Name <you@example.com>"
 *   --html           (send body as HTML instead of plain text)
 */
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) return env;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--to' && args[i + 1]) { out.to = args[i + 1]; i++; }
    else if (args[i] === '--subject' && args[i + 1]) { out.subject = args[i + 1]; i++; }
    else if (args[i] === '--body' && args[i + 1]) { out.body = args[i + 1]; i++; }
    else if (args[i] === '--from' && args[i + 1]) { out.from = args[i + 1]; i++; }
    else if (args[i] === '--html') { out.html = true; }
  }
  return out;
}

function sendEmail({ to, subject, body, from, html = false }) {
  const host = env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(env.SMTP_PORT || '465', 10);
  const secure = env.SMTP_SECURE !== 'false';
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const message = {
    from: from || user,
    to,
    subject,
  };

  if (html) {
    message.html = body;
  } else {
    message.text = body;
  }

  return transporter.sendMail(message);
}

async function main() {
  const args = parseArgs();
  if (!args.to || !args.subject || !args.body) {
    console.error('Usage: node scripts/send-email.js --to <email> --subject <subject> --body <body> [--from <from>] [--html]');
    process.exit(1);
  }

  try {
    const info = await sendEmail(args);
    console.log(`Email sent: ${info.messageId}`);
  } catch (err) {
    console.error(`Failed to send: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { sendEmail, loadEnv };

if (require.main === module) main();

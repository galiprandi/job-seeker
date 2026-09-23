#!/usr/bin/env node
/**
 * teams.js — Microsoft Teams web CLI.
 *
 * Sends messages via keyboard automation. Teams web supports Markdown.
 *
 * Usage:
 *   node scripts/teams.js send <chatId> <message>           Send message (inline, short)
 *   node scripts/teams.js send <chatId> << 'EOF'             Send message via stdin (long, multiline)
 *   ...message...
 *   EOF
 *   node scripts/teams.js -h|--help                          This help
 *
 * chatId format: 19:meeting_xxx@thread.v2 or 48:notes (personal notes)
 * Navigates to https://teams.microsoft.com/v2/chat/<chatId>
 *
 * Markdown supported: [#text](url), **bold**, *italic*, - bullet, > quote
 * HTML tags are typed as literal text. Use Markdown instead.
 *
 * How it works:
 *   1. Navigate to the chat (via browser.js wrapper)
 *   2. Wait for div[role=textbox] (poll up to 24s)
 *   3. Focus textbox, clear any existing content
 *   4. Type each line with playwright-cli type -- <line>
 *   5. Shift+Enter between lines (Enter is newline, NOT send)
 *   6. Meta+Enter after last line (sends the message)
 *
 * Requires: browser.js wrapper in the same directory (scripts/browser.js).
 *           The wrapper resolves .browser-profile from the consuming repo's cwd.
 */
'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = path.resolve(__dirname);
const BROWSER_JS = path.join(SCRIPT_DIR, 'browser.js');
const TEAMS_BASE = 'https://teams.microsoft.com/v2';

// The consuming repo's root (cwd), where .browser-profile lives
const CWD = process.cwd();

function fail(msg, code = 1) {
  console.error(`[teams] ${msg}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node scripts/teams.js send <chatId> <message>           Send message (inline, short)
  node scripts/teams.js send <chatId> < file.md            Send message via stdin (long, multiline)

chatId format: 19:meeting_xxx@thread.v2 or 48:notes (personal notes)
Navigates to https://teams.microsoft.com/v2/chat/<chatId>

Markdown supported: [#text](url), **bold**, *italic*, - bullet, > quote
HTML tags are typed as literal text. Use Markdown instead.

Examples:
  # Short message
  node scripts/teams.js send 48:notes "mensaje corto"

  # Long message via stdin (heredoc)
  node scripts/teams.js send 48:notes << 'EOF'
  📊 Triage report

  46 tickets · 27 overdue

  [#1234](https://example.com/tickets/1234)
  EOF

  # Long message from a file
  cat /tmp/report.md | node scripts/teams.js send 48:notes`);
}

/**
 * Read stdin as a string.
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Navigate to a Teams chat and type a message line by line.
 * Uses browser.js wrapper for navigation, playwright-cli for typing.
 * Meta+Enter at the end sends the message.
 */
async function sendMessage(chatId, message) {
  if (!chatId) fail('send requires <chatId>');
  if (!message || !message.trim()) fail('send requires a message (inline arg or stdin)');

  message = message.trim();

  // Navigate to the chat using the browser.js wrapper
  const chatUrl = `${TEAMS_BASE}/chat/${chatId}`;
  try {
    execSync(`node "${BROWSER_JS}" goto ${chatUrl}`, {
      cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
    });
  } catch (e) {
    // goto may timeout waiting for page load, but navigation still happens
  }

  // Wait for the textbox to appear. Teams v2 can take 10-20s to render.
  let textboxReady = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    execSync('sleep 2', { encoding: 'utf8', timeout: 10000 });
    try {
      const out = execSync(
        `npx playwright-cli eval "document.querySelector('div[role=textbox]') ? 'ready' : 'no'"`,
        { cwd: CWD, encoding: 'utf8', timeout: 15000, stdio: 'pipe' }
      );
      if (out.includes('ready')) { textboxReady = true; break; }
    } catch (e) {
      // eval may fail if page is still loading, retry
    }
  }
  if (!textboxReady) {
    fail('Textbox not found after 24s. Make sure Teams is logged in and the chat exists.');
  }

  // Focus the textbox
  execSync(`npx playwright-cli eval "document.querySelector('div[role=textbox]').focus()"`, {
    cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
  });

  // Clear any existing content
  execFileSync('npx', ['playwright-cli', 'press', 'Meta+a'], {
    cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
  });
  execFileSync('npx', ['playwright-cli', 'press', 'Delete'], {
    cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
  });

  // Type each line with playwright-cli type, Shift+Enter between lines
  const lines = message.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 0) {
      // Use -- to separate args from options (handles lines starting with ---)
      execFileSync('npx', ['playwright-cli', 'type', '--', line], {
        cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
      });
    }
    if (i < lines.length - 1) {
      execFileSync('npx', ['playwright-cli', 'press', 'Shift+Enter'], {
        cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
      });
    }
  }

  // Send with Meta+Enter (Cmd+Enter on macOS). In Teams v2, Enter alone is a newline
  // in the contenteditable; Meta+Enter is the actual send shortcut.
  execSync('npx playwright-cli press Meta+Enter', {
    cwd: CWD, encoding: 'utf8', timeout: 30000, stdio: 'pipe',
  });

  console.log(JSON.stringify({ status: 'sent', method: 'keyboard', chatId, lines: lines.length, chars: message.length }));
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    if (a === '-h' || a === '--help') { usage(); process.exit(0); }
    else if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      args[k] = v.length ? v.join('=') : true;
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._.shift();

  switch (command) {
    case 'send': {
      const chatId = args._.shift();
      const inlineMsg = args._.join(' ');

      if (inlineMsg) {
        // Message passed as argument (short)
        await sendMessage(chatId, inlineMsg);
      } else if (!process.stdin.isTTY) {
        // Message via stdin (long, multiline, heredoc or pipe)
        const stdinMsg = await readStdin();
        await sendMessage(chatId, stdinMsg);
      } else {
        fail('send requires a message (inline arg or stdin). Run --help for usage.');
      }
      break;
    }
    case '-h':
    case '--help':
      usage();
      break;
    default:
      if (!command) { usage(); process.exit(0); }
      fail(`Unknown command: ${command}. Run --help for usage.`);
  }
}

main().catch(err => fail(err.message));

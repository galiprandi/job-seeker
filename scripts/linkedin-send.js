#!/usr/bin/env node
/**
 * linkedin-send.js — Send LinkedIn messages with optional attachments.
 *
 * Supports:
 *   - Reply to existing conversation (by thread ID)
 *   - New conversation (first message to a connection, by recipient fsd_profile_id)
 *   - Text only
 *   - Text + file attachment (PDF, etc.)
 *
 * Usage:
 *   # Reply (text only)
 *   node scripts/linkedin-send.js --thread "2-XXXX==" --text "Hello"
 *
 *   # Reply with attachment
 *   node scripts/linkedin-send.js --thread "2-XXXX==" --text "Here is my CV" --file /path/to/cv.pdf
 *
 *   # New conversation (text only)
 *   node scripts/linkedin-send.js --recipient "ACoAA123" --text "Hi, nice to connect"
 *
 *   # New conversation with attachment
 *   node scripts/linkedin-send.js --recipient "ACoAA123" --text "Here is my CV" --file /path/to/cv.pdf
 *
 * Requires: browser open with LinkedIn tab (node scripts/browser.js open "https://www.linkedin.com")
 *
 * Endpoints:
 *   New conversation:  POST /voyager/api/messaging/conversations?action=create
 *   Reply:             POST /voyager/api/messaging/conversations/{chatId}/events?action=create
 *   With attachment:   POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage
 *   Upload register:   POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload
 *   Upload binary:     PUT {singleUploadUrl}
 */
'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BROWSER_JS = path.join(__dirname, 'browser.js');

function fail(msg, code = 1) {
  console.error(`[linkedin-send] ${msg}`);
  process.exit(code);
}

function usage() {
  console.log(`Usage:
  node scripts/linkedin-send.js --thread "2-XXXX==" --text "Hello"
  node scripts/linkedin-send.js --thread "2-XXXX==" --text "Here is my CV" --file /path/to/cv.pdf
  node scripts/linkedin-send.js --recipient "ACoAA123" --text "Hi, nice to connect"
  node scripts/linkedin-send.js --recipient "ACoAA123" --text "Hi" --file /path/to/cv.pdf
  node scripts/linkedin-send.js --tab linkedin --thread "2-XXXX==" --text "Hello"

Options:
  --thread <id>       Thread ID for reply (format: 2-XXXXX==)
  --recipient <id>    Recipient fsd_profile_id for new conversation (format: ACoAA...)
  --text <message>    Message text (required)
  --file <path>       File to attach (optional)
  --tab <name>        Browser tab name (default: linkedin)
  --help, -h          Show this help

Requires: browser open with LinkedIn loaded on the specified tab.`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { tab: null };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--thread': opts.thread = args[++i]; break;
      case '--recipient': opts.recipient = args[++i]; break;
      case '--text': opts.text = args[++i]; break;
      case '--file': opts.file = args[++i]; break;
      case '--tab': opts.tab = args[++i]; break;
      case '--help': case '-h': usage(); process.exit(0);
      default: fail(`Unknown argument: ${args[i]}`);
    }
  }
  if (!opts.text) fail('--text is required');
  if (!opts.thread && !opts.recipient) fail('Either --thread or --recipient is required');
  if (opts.thread && opts.recipient) fail('Use --thread OR --recipient, not both');
  if (!opts.tab) opts.tab = getDefaultTab();
  return opts;
}

function browserExec(cmd) {
  return execSync(`node ${BROWSER_JS} ${cmd}`, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 60000,
    stdio: 'pipe',
  });
}

function browserEval(js, tab) {
  // Use execFileSync directly with playwright-cli to avoid shell escaping issues.
  // First select the tab (if specified), then run eval.
  const repoRoot = path.resolve(__dirname, '..');

  // Get session from browser.js lock file
  let session = 'default';
  try {
    const lockContent = fs.readFileSync(path.join(repoRoot, '.browser-profile', '.lock'), 'utf8');
    const lock = JSON.parse(lockContent);
    session = lock.session || 'default';
  } catch {}

  // Get tab index if tab is specified
  let tabIndex = null;
  if (tab && tab !== 'default') {
    try {
      const tabsState = JSON.parse(fs.readFileSync(path.join(repoRoot, '.playwright-cli', 'tabs-state.json'), 'utf8'));
      if (tabsState.tabs[tab]) tabIndex = tabsState.tabs[tab].index;
    } catch {}
  }

  const args = [`-s=${session}`];
  if (tabIndex !== null) {
    args.push('tab-select', String(tabIndex));
    execFileSync('playwright-cli', [`-s=${session}`, 'tab-select', String(tabIndex)], {
      cwd: repoRoot, stdio: 'pipe', timeout: 10000,
    });
  }

  args.push('eval', js);

  const out = execFileSync('playwright-cli', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60000,
    stdio: 'pipe',
  });

  const m = out.match(/### Result\s*\n([\s\S]*?)(?:\n###|$)/);
  if (m) return m[1].trim();
  return out.trim();
}

function getDefaultTab() {
  try {
    const out = browserExec('tab-list');
    const m = out.match(/^\s*\d+:\s*(\S+)/m);
    return m ? m[1] : 'default';
  } catch {
    return 'default';
  }
}

function main() {
  const opts = parseArgs();
  const hasAttachment = !!opts.file;

  // Read and encode file if provided
  let fileB64 = '';
  let fileName = 'document.pdf';
  let fileMime = 'application/pdf';
  if (hasAttachment) {
    if (!fs.existsSync(opts.file)) fail(`File not found: ${opts.file}`);
    const buf = fs.readFileSync(opts.file);
    fileB64 = buf.toString('base64');
    fileName = path.basename(opts.file);
    const ext = path.extname(opts.file).toLowerCase();
    const mimeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.txt': 'text/plain',
    };
    fileMime = mimeMap[ext] || 'application/octet-stream';
  }

  // Build the eval script
  const mode = opts.thread ? 'reply' : 'new';
  const threadId = opts.thread || '';
  const recipientId = opts.recipient || '';

  const evalScript = `(async function () {
  var csrf = document.cookie
    .split('; ')
    .find(function (c) { return c.indexOf('JSESSIONID=') === 0; });
  csrf = csrf ? csrf.split('=')[1].replace(/"/g, '') : '';

  var MODE = ${JSON.stringify(mode)};
  var RECIPIENT_ID = ${JSON.stringify(recipientId)};
  var THREAD_ID = ${JSON.stringify(threadId)};
  var MESSAGE_TEXT = ${JSON.stringify(opts.text)};
  var FILE_B64 = ${JSON.stringify(fileB64)};
  var FILE_NAME = ${JSON.stringify(fileName)};
  var FILE_MIME = ${JSON.stringify(fileMime)};

  var SELF_ID = (document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) || [])
    .sort(function (a, b) {
      return document.documentElement.outerHTML.split(a).length - document.documentElement.outerHTML.split(b).length;
    }).pop();

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function randomTrackingId() {
    var t = '';
    for (var i = 0; i < 16; i++) t += String.fromCharCode(Math.floor(Math.random() * 256));
    return t;
  }

  function b64ToBlob(b64, mime) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  var hasAttachment = FILE_B64.length > 0;

  // --- Text-only: new conversation (legacy endpoint) ---
  if (MODE === 'new' && !hasAttachment) {
    var body = {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: { text: MESSAGE_TEXT, attributes: [] },
              attachments: [],
            },
          },
        },
        recipients: [RECIPIENT_ID],
        subtype: 'MEMBER_TO_MEMBER',
      },
    };

    var r = await fetch('/voyager/api/messaging/conversations?action=create', {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    var t = await r.text();
    return r.status + ' ' + r.statusText + ' ' + t.substring(0, 500);
  }

  // --- Text-only: reply (legacy endpoint) ---
  if (MODE === 'reply' && !hasAttachment) {
    var replyBody = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: { text: MESSAGE_TEXT, attributes: [] },
            attachments: [],
          },
        },
      },
    };

    var r2 = await fetch('/voyager/api/messaging/conversations/' + encodeURIComponent(THREAD_ID) + '/events?action=create', {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(replyBody),
    });
    var t2 = await r2.text();
    return r2.status + ' ' + r2.statusText + ' ' + t2.substring(0, 500);
  }

  // --- With attachment: use dash endpoint ---
  function sendWithAttachment(fileBlob, fileSize, mediaUrn) {
    var blobUrl = URL.createObjectURL(fileBlob);
    var convUrn = 'urn:li:msg_conversation:(urn:li:fsd_profile:' + SELF_ID + ',' + THREAD_ID + ')';

    var dashBody = JSON.stringify({
      message: {
        body: { attributes: [], text: MESSAGE_TEXT },
        renderContentUnions: [
          {
            file: {
              assetUrn: mediaUrn,
              byteSize: fileSize,
              mediaType: FILE_MIME,
              name: FILE_NAME,
              url: blobUrl,
            },
          },
        ],
        conversationUrn: convUrn,
        originToken: uuid(),
      },
      mailboxUrn: 'urn:li:fsd_profile:' + SELF_ID,
      trackingId: randomTrackingId(),
      dedupeByClientGeneratedToken: false,
    });

    return fetch('/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: dashBody,
    }).then(function (r) { return r.text(); }).then(function (t) { return t.substring(0, 1500); });
  }

  var fileBlob = b64ToBlob(FILE_B64, FILE_MIME);
  var fileSize = fileBlob.size;

  // Step 1: Register upload
  var registerBody = JSON.stringify({
    mediaUploadType: 'MESSAGING_FILE_ATTACHMENT',
    fileSize: fileSize,
    filename: FILE_NAME,
  });

  var regRes = await fetch('/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload', {
    method: 'POST',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf,
      'content-type': 'application/json',
    },
    body: registerBody,
  });
  var regData = await regRes.json();
  var uploadUrl = regData.data.value.singleUploadUrl;
  var mediaUrn = regData.data.value.urn;

  // Step 2: Upload binary
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': FILE_MIME },
    body: fileBlob,
  });

  // Step 3: Wait for processing
  await new Promise(function (resolve) { setTimeout(resolve, 2000); });

  // Step 4: Send message with attachment
  var result = await sendWithAttachment(fileBlob, fileSize, mediaUrn);
  return result;
})()`;

  console.log(`[linkedin-send] Sending ${hasAttachment ? 'message with attachment' : 'text-only message'}...`);
  console.log(`[linkedin-send] Mode: ${mode}, Tab: ${opts.tab}`);

  try {
    const result = browserEval(evalScript, opts.tab);
    console.log(`[linkedin-send] Result: ${result}`);
    if (result.includes('201') || result.includes('200') || result.includes('entityUrn')) {
      console.log('[linkedin-send] ✓ Message sent successfully');
    } else {
      console.log('[linkedin-send] ⚠ Unexpected response, verify manually');
    }
  } catch (e) {
    fail(`Failed to send: ${e.message}`);
  }
}

main();

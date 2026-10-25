#!/usr/bin/env node
/**
 * upload-file.js — Upload a file to a file input on the current page.
 * Uses the same browser profile as .agents/skills/browser-automation/scripts/browser.js
 * (agent-browser backend).
 *
 * Usage: node scripts/upload-file.js <file-path> [input-index] [--session <name>]
 */
const path = require('path');
const fs = require('fs');
const { execSub, evalJS } = require('../lib/browser-helpers');

function main() {
  const filePath = process.argv[2];
  const inputIndex = parseInt(process.argv[3] || '0', 10);
  const si = process.argv.indexOf('--session');
  const session = si >= 0 ? process.argv[si + 1] : 'default';

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/upload-file.js <file-path> [input-index] [--session <name>]');
    process.exit(1);
  }

  // Tag the target input so we can address it with a plain selector.
  const marker = `ab-upload-${Date.now()}`;
  const found = evalJS(`(function(){
    var inputs = document.querySelectorAll('input[type="file"]');
    var el = inputs[${inputIndex}];
    if (!el) return 'not_found';
    el.setAttribute('data-ab-upload', '${marker}');
    return 'ok';
  })()`, { session });
  if (found !== 'ok') {
    console.error(`No file input at index ${inputIndex}`);
    process.exit(1);
  }

  execSub(`upload 'input[data-ab-upload="${marker}"]' '${filePath.replace(/'/g, `'\\''`)}'`, { session }, 30000);
  console.log(`Uploaded: ${path.basename(filePath)}`);
}

main();

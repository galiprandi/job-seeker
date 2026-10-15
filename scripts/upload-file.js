#!/usr/bin/env node
/**
 * upload-file.js — Upload a file to a file input on the current page.
 * Uses the same browser profile as .agents/skills/browser-automation/scripts/browser.js.
 *
 * Usage: node scripts/upload-file.js <file-path> <input-index>
 */
const path = require('path');
const fs = require('fs');

async function main() {
  const filePath = process.argv[2];
  const inputIndex = parseInt(process.argv[3] || '1', 10);

  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: node scripts/upload-file.js <file-path> [input-index]');
    process.exit(1);
  }

  const { chromium } = require('playwright');
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.browser-config.json'), 'utf8').trim() || '{}');
  const browserMode = process.env.BROWSER_MODE || config.browser_mode || 'headless';

  const browser = await chromium.launchPersistentContext(
    path.join(__dirname, '..', '.browser-profile'),
    {
      headless: browserMode === 'headless',
      args: ['--disable-blink-features=AutomationControlled'],
    }
  );

  // Use existing page
  const pages = browser.pages();
  const page = pages[pages.length - 1] || await browser.newPage();

  const inputs = await page.locator('input[type="file"]').all();
  if (inputs.length <= inputIndex) {
    console.error('No file input at index ' + inputIndex + ', found ' + inputs.length);
    await browser.close();
    process.exit(1);
  }

  await inputs[inputIndex].setInputFiles(filePath);
  console.log('File uploaded: ' + filePath);

  // Wait for upload to process
  await page.waitForTimeout(3000);
  console.log('Done');

  // Don't close — leave the session alive
  // But we can't keep it open from this process
  // Instead, just exit and let the wrapper reconnect
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

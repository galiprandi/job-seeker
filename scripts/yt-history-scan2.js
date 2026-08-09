#!/usr/bin/env node
/**
 * Scrolls through YouTube history using keyboard and extracts all unique channels.
 * YouTube uses virtual scrolling, so we need to extract channels at each scroll position.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const { getSocial } = require('./social');

const BROWSER = 'node scripts/browser.js';
const YT_HANDLE = getSocial().youtube_handle || '<your-handle>';
const MAX_ATTEMPTS = 300;
const OUTPUT_FILE = '/tmp/yt_channels_all.json';

function evalJS(code) {
  try {
    const escaped = code.replace(/'/g, "'\\''");
    const result = execSync(`${BROWSER} exec eval '${escaped}'`, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: __dirname + '/..',
    });
    const match = result.match(/### Result\n(.+)/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { return match[1].trim(); }
    }
    return null;
  } catch (e) { return null; }
}

function pressKey(key) {
  try {
    execSync(`${BROWSER} exec press '${key}'`, {
      encoding: 'utf8',
      timeout: 10000,
      cwd: __dirname + '/..',
    });
  } catch (e) {}
}

function extractChannels() {
  const code = `(function(){var links=document.querySelectorAll('a[href*="/@"]');var seen={};var channels=[];for(var i=0;i<links.length;i++){var h=links[i].href;var t=links[i].textContent.trim();if(h&&!seen[h]&&t.length>0&&t.length<60&&!h.includes('/${YT_HANDLE}')&&!t.includes('Tu canal')){seen[h]=1;channels.push(t+'|||'+h)}}return channels.join(';;')})()`;
  return evalJS(code);
}

function getScrollInfo() {
  const code = `(function(){var app=document.querySelector('ytd-app');var list=document.querySelector('ytd-section-list-renderer');var s=list||app||document.body;return 'scrollY:'+window.scrollY+' scrollHeight:'+document.documentElement.scrollHeight+' appSH:'+(app?app.scrollHeight:0)+' listSH:'+(list?list.scrollHeight:0)})()`;
  return evalJS(code);
}

console.log('Starting YouTube history scan with keyboard scrolling...');
let allChannels = new Map(); // key: lowercase name, value: {name, url}
let prevCount = 0;
let staleRounds = 0;

for (let i = 0; i < MAX_ATTEMPTS; i++) {
  // Extract channels at current position
  const result = extractChannels();
  if (result && typeof result === 'string') {
    const channels = result.split(';;').filter(Boolean);
    for (const ch of channels) {
      const [name, url] = ch.split('|||');
      if (name && url) {
        const key = name.toLowerCase().trim();
        if (!allChannels.has(key)) {
          allChannels.set(key, { name: name.trim(), url: url.trim() });
        }
      }
    }
  }

  // Press Page Down to scroll
  pressKey('PageDown');
  // Also try End key occasionally to jump further
  if (i % 5 === 0) pressKey('End');

  // Wait for content to load
  execSync('sleep 1', { timeout: 5000 });

  const currentCount = allChannels.size;
  if (currentCount === prevCount) {
    staleRounds++;
    if (staleRounds > 20) {
      console.log(`No new channels after ${staleRounds} attempts. Stopping.`);
      break;
    }
  } else {
    staleRounds = 0;
  }

  if (i % 10 === 0) {
    const scrollInfo = getScrollInfo();
    console.log(`Attempt ${i + 1}/${MAX_ATTEMPTS} - ${currentCount} unique channels - ${scrollInfo}`);
  }
  prevCount = currentCount;
}

const finalChannels = Array.from(allChannels.values());
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalChannels, null, 2));
console.log(`\nDone! Found ${finalChannels.length} unique channels.`);
console.log(`Saved to ${OUTPUT_FILE}`);
console.log('\nAll channels:');
for (const ch of finalChannels) {
  console.log(`  ${ch.name} - ${ch.url}`);
}

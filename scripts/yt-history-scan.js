#!/usr/bin/env node
/**
 * Scrolls through YouTube history and extracts all unique channels.
 * Outputs JSON array of {name, url} pairs.
 * Run: node scripts/yt-history-scan.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const { getSocial } = require('./social');

const BROWSER = 'node scripts/browser.js';
const YT_HANDLE = getSocial().youtube_handle || '<your-handle>';
const MAX_SCROLLS = 200;
const SCROLL_STEP = 8000;
const OUTPUT_FILE = '/tmp/yt_channels.json';

function evalJS(code) {
  try {
    const escaped = code.replace(/'/g, "'\\''");
    const result = execSync(`${BROWSER} exec eval '${escaped}'`, {
      encoding: 'utf8',
      timeout: 30000,
      cwd: __dirname + '/..',
    });
    // Extract the Result line
    const match = result.match(/### Result\n(.+)/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return match[1].trim();
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function extractChannels() {
  const code = `(function(){var links=document.querySelectorAll('a[href*="/@"]');var seen={};var channels=[];for(var i=0;i<links.length;i++){var h=links[i].href;var t=links[i].textContent.trim();if(h&&!seen[h]&&t.length>0&&t.length<60&&!h.includes('/${YT_HANDLE}')){seen[h]=1;channels.push(t+'|||'+h)}}return channels.join(';;')})()`;
  return evalJS(code);
}

function scrollDown(amount) {
  const code = `window.scrollTo(0,${amount})`;
  evalJS(code);
}

console.log('Starting YouTube history scan...');
let allChannels = new Set();
let prevCount = 0;
let staleRounds = 0;

for (let i = 0; i < MAX_SCROLLS; i++) {
  scrollDown((i + 1) * SCROLL_STEP);
  // Wait for content to load
  execSync('sleep 2', { timeout: 5000 });

  const result = extractChannels();
  if (result && typeof result === 'string') {
    const channels = result.split(';;').filter(Boolean);
    for (const ch of channels) {
      allChannels.add(ch);
    }
  }

  const currentCount = allChannels.size;
  if (currentCount === prevCount) {
    staleRounds++;
    if (staleRounds > 10) {
      console.log(`No new channels after ${staleRounds} scrolls. Stopping.`);
      break;
    }
  } else {
    staleRounds = 0;
  }

  if (i % 10 === 0) {
    console.log(`Scroll ${i + 1}/${MAX_SCROLLS} - ${currentCount} unique channels found`);
  }
  prevCount = currentCount;
}

// Parse and deduplicate by channel name
const channelMap = new Map();
for (const entry of allChannels) {
  const [name, url] = entry.split('|||');
  if (name && url && !channelMap.has(name.toLowerCase())) {
    channelMap.set(name.toLowerCase(), { name, url });
  }
}

const finalChannels = Array.from(channelMap.values());
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalChannels, null, 2));
console.log(`\nDone! Found ${finalChannels.length} unique channels.`);
console.log(`Saved to ${OUTPUT_FILE}`);
console.log('\nChannels:');
for (const ch of finalChannels) {
  console.log(`  ${ch.name} - ${ch.url}`);
}

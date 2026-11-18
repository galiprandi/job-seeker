#!/usr/bin/env node
/**
 * linkedin-search.js — Search LinkedIn posts for job openings and extract contacts.
 *
 * Uses agent-browser via the browser.js wrapper (browser must be running first).
 * Extracts: author name, profile URL (vanity), post content, email (if visible).
 * Outputs JSON array to stdout.
 *
 * Usage:
 *   node .agents/skills/browser-automation/scripts/browser.js open "https://www.linkedin.com"   # ensure session
 *   node scripts/linkedin-search.js '"<Your Role>" "hiring" <Region>'
 *   node scripts/linkedin-search.js '"<Your Role>" "hiring" <Region>' --scroll 3
 *   node scripts/linkedin-search.js '"<Your Role>" "<Your City>" "hiring"' --json
 *
 * Flags:
 *   --scroll <n>   Number of times to scroll down for more results (default: 2)
 *   --json         Output raw JSON (default: human-readable table)
 *   --session <name> Browser session name (default: "default". Use a different name for parallel agents)
 *   --date-posted <v> LinkedIn date filter: past-24h | past-week | past-month (default: none)
 *
 * Exit codes:
 *   0 = success (results found)
 *   1 = no results found
 *   2 = browser not running / error
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { evalJSON } = require('../lib/browser-helpers');

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
  // --urls exposes link hrefs (needed to extract profile vanities).
  return cli('snapshot --urls');
}

function scroll(amount = 5000) {
  cli(`eval "window.scrollBy(0, ${amount})"`);
}

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function extractPosts(snap) {
  const posts = [];
  const lines = snap.split('\n');

  let currentAuthor = null;
  let currentVanity = null;
  let currentContent = [];
  let currentEmail = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Author: `[button] "Open control menu for post by <name>"` (agent-browser)
    // or legacy `button "Open control menu for post by <name>"`.
    const authorMatch = line.match(/\[button\] "Open control menu for post by (.+?)"/)
      || line.match(/button "Open control menu for post by (.+?)"/);
    if (authorMatch) {
      if (currentAuthor) {
        posts.push({
          author: currentAuthor,
          vanity: currentVanity,
          email: currentEmail,
          content: currentContent.join(' ').substring(0, 500),
        });
      }
      currentAuthor = authorMatch[1];
      currentVanity = null;
      currentContent = [];
      currentEmail = null;
      continue;
    }

    // Profile URL: --urls output embeds hrefs; match any form.
    const urlMatch = line.match(/https:\/\/www\.linkedin\.com\/in\/([^/\s"')]+)\/?/);
    if (urlMatch && !currentVanity) {
      currentVanity = urlMatch[1];
      continue;
    }

    // Email: "mailto:" or "- url: mailto:<email>"
    const emailMatch = line.match(/mailto:([^\s"]+)/);
    if (emailMatch) {
      currentEmail = emailMatch[1];
      continue;
    }

    // Content: legacy "- text: ..." or agent-browser generic/static text nodes
    const textMatch = line.match(/^\s*- text: (.+)/)
      || line.match(/\[(?:generic|StaticText|text)\] "(.+)"/);
    if (textMatch && currentAuthor) {
      currentContent.push(textMatch[1]);
    }
  }

  // Last post
  if (currentAuthor) {
    posts.push({
      author: currentAuthor,
      vanity: currentVanity,
      email: currentEmail,
      content: currentContent.join(' ').substring(0, 500),
    });
  }

  return posts;
}

/**
 * 2026 content-search UI: each post is a div two levels above a visually hidden
 * "Publicación en el feed" / "Feed post" label, without the old control-menu
 * button. Read posts straight from the DOM.
 */
function extractPostsFromDOM() {
  const out = evalJSON(`(function(){
    const labels = [...document.querySelectorAll('main span, main h2')].filter(e =>
      e.children.length === 0 && /^(Publicación en el feed|Feed post)$/.test(e.textContent.trim()));
    const posts = [];
    for (const l of labels) {
      let c = l.parentElement;
      for (let i = 0; i < 6 && c && !c.querySelector('a[href*="/in/"], a[href*="/company/"]'); i++) c = c.parentElement;
      if (!c) continue;
      const lines = (c.innerText || '').split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean)
        .filter(s => !/^(Publicación en el feed|Feed post)$/.test(s));
      const profile = c.querySelector('a[href*="/in/"]');
      const vanity = profile ? (profile.href.match(/\\/in\\/([^/?#]+)/) || [])[1] || null : null;
      const text = lines.join(' ');
      const email = (text.match(/[\\w.+-]+@[\\w-]+\\.[\\w.]+/) || [null])[0];
      const when = lines.slice(0, 8).find(s => /^\\d+\\s?(min|h|d|sem|w|mo)/.test(s)) || '';
      const update = c.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]');
      posts.push({ author: lines[0] || '', vanity, email, when,
        url: update ? update.href.split('?')[0] : null,
        content: lines.slice(1).join(' ').substring(0, 1500) });
    }
    return JSON.stringify(posts);
  })()`, { session: SESSION });
  return Array.isArray(out) ? out : [];
}

function filterRelevant(posts, keywords) {
  // Extract search terms from the keywords string (split by OR, strip quotes)
  const searchTerms = keywords
    .toLowerCase()
    .split(/\s+or\s+|\s+and\s+/)
    .map((t) => t.replace(/["']/g, '').trim())
    .filter((t) => t.length > 2);

  // Also include common hiring terms
  const hiringTerms = ['hiring', 'buscamos', 'looking for', 'vacante', 'oportunidad', 'remote', 'remoto'];
  const allTerms = [...searchTerms, ...hiringTerms];

  return posts.filter((p) => {
    const content = (p.content || '').toLowerCase();
    return allTerms.some((term) => content.includes(term));
  });
}

function dedupe(posts) {
  const seen = new Set();
  return posts.filter((p) => {
    // One author can publish several openings: key on author + content start.
    const key = `${p.vanity || p.author}|${(p.content || '').substring(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/linkedin-search.js "<keywords>" [--scroll <n>] [--json]');
    process.exit(2);
  }

  const keywords = args[0];
  let scrollCount = 2;
  let jsonOutput = false;
  let datePosted = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--scroll' && args[i + 1]) {
      scrollCount = parseInt(args[i + 1], 10);
      i++;
    }
    else if (args[i] === '--session' && args[i + 1]) { SESSION = args[i + 1]; i++; }
    else if (args[i] === '--date-posted' && args[i + 1]) { datePosted = args[i + 1]; i++; }
    if (args[i] === '--json') jsonOutput = true;
  }

  const encodedKeywords = encodeURIComponent(keywords);
  const dateFilter = datePosted ? `&datePosted=${encodeURIComponent(`"${datePosted}"`)}` : '';
  const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodedKeywords}${dateFilter}&sortBy=%22date_posted%22`;

  // Navigate to search (exec navigate forwards --session; wrapper goto does not)
  cli(`navigate "${searchUrl}"`);
  sleep(5000);

  // Collect posts from initial load + scrolls
  let allPosts = [];
  const collect = () => {
    const fromDom = extractPostsFromDOM();
    allPosts.push(...(fromDom.length ? fromDom : extractPosts(snapshot())));
  };
  collect();

  for (let i = 0; i < scrollCount; i++) {
    scroll(5000);
    sleep(3000);
    collect();
  }

  // Dedupe and filter
  const unique = dedupe(allPosts);
  const relevant = filterRelevant(unique, keywords);

  if (relevant.length === 0) {
    if (jsonOutput) {
      console.log('[]');
    } else {
      console.log('No relevant posts found.');
    }
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(relevant, null, 2));
  } else {
    console.log(`\nFound ${relevant.length} relevant posts:\n`);
    relevant.forEach((p, i) => {
      console.log(`${i + 1}. ${p.author}`);
      console.log(`   Profile: https://www.linkedin.com/in/${p.vanity}/`);
      if (p.email) console.log(`   Email:   ${p.email}`);
      const preview = p.content.substring(0, 150).replace(/\n/g, ' ');
      console.log(`   Preview: ${preview}...`);
      console.log();
    });
  }

  process.exit(0);
}

main();

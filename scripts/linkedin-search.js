#!/usr/bin/env node
/**
 * linkedin-search.js — Search LinkedIn posts for job openings and extract contacts.
 *
 * Uses playwright-cli (must be running via browser.js wrapper first).
 * Extracts: author name, profile URL (vanity), post content, email (if visible).
 * Outputs JSON array to stdout.
 *
 * Usage:
 *   node scripts/browser.js open "https://www.linkedin.com"   # ensure session
 *   node scripts/linkedin-search.js '"<Your Role>" "hiring" LATAM'
 *   node scripts/linkedin-search.js '"<Your Role>" "hiring" LATAM' --scroll 3
 *   node scripts/linkedin-search.js '"<Your Role>" "<Your City>" "hiring"' --json
 *
 * Flags:
 *   --scroll <n>   Number of times to scroll down for more results (default: 2)
 *   --json         Output raw JSON (default: human-readable table)
 *   --session <name> Browser session name (default: "default". Use a different name for parallel agents)
 *
 * Exit codes:
 *   0 = success (results found)
 *   1 = no results found
 *   2 = browser not running / error
 */
'use strict';

const { execSync } = require('child_process');

let SESSION = 'default';

function cli(args) {
  const sessionFlag = SESSION !== 'default' ? `-s=${SESSION} ` : '';
  try {
    return execSync(`playwright-cli ${sessionFlag}${args}`, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: __dirname,
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function snapshot() {
  return cli('snapshot');
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

    // Author: "button "Open control menu for post by <name>""
    const authorMatch = line.match(/button "Open control menu for post by (.+?)"/);
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

    // Profile URL: "/url: https://www.linkedin.com/in/<vanity>/"
    const urlMatch = line.match(/\/url: https:\/\/www\.linkedin\.com\/in\/([^/]+)\//);
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

    // Content: "- text: ..."
    const textMatch = line.match(/^\s*- text: (.+)/);
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
    const key = p.vanity || p.author;
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

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--scroll' && args[i + 1]) {
      scrollCount = parseInt(args[i + 1], 10);
      i++;
    }
    else if (args[i] === '--session' && args[i + 1]) { SESSION = args[i + 1]; i++; }
    if (args[i] === '--json') jsonOutput = true;
  }

  const encodedKeywords = encodeURIComponent(keywords);
  const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodedKeywords}&sortBy=%22date_posted%22`;

  // Navigate to search
  const sessionArg = SESSION !== 'default' ? `--session ${SESSION}` : '';
  execSync(`node ${__dirname}/browser.js goto "${searchUrl}" ${sessionArg}`, { stdio: 'pipe', cwd: __dirname });
  sleep(5000);

  // Collect posts from initial load + scrolls
  let allPosts = [];
  let snap = snapshot();
  allPosts.push(...extractPosts(snap));

  for (let i = 0; i < scrollCount; i++) {
    scroll(5000);
    sleep(3000);
    snap = snapshot();
    allPosts.push(...extractPosts(snap));
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

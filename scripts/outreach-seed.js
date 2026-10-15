#!/usr/bin/env node
/**
 * Seeds the outreach_contacts table from a user-provided JSON file.
 * Candidate-agnostic: no personal data is stored in this file.
 *
 * Usage:
 *   node scripts/outreach-seed.js                          # reads .outreach-contacts.json
 *   node scripts/outreach-seed.js --file /path/to/contacts.json
 *
 * JSON format (array of objects):
 * [
 *   { "name": "<Name>", "handle": "<handle>", "platform": "<platform>", "platform_url": "<url>", "language": "<lang>", "category": "<category>", "audience_size": "<small|medium|large>", "priority": "<normal|high>" },
 *   ...
 * ]
 *
 * Platforms: twitch, youtube, twitter, linkedin, github, reddit, hn, dev.to, producthunt
 * Categories: streamer, creator, company, community, podcast, newsletter, oss, ai-builder
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const fileIdx = args.indexOf('--file');
const contactsFile = fileIdx > -1 ? args[fileIdx + 1] : path.join(process.cwd(), '.outreach-contacts.json');

if (!fs.existsSync(contactsFile)) {
  console.error(`Contacts file not found: ${contactsFile}`);
  console.error('Create one with: node scripts/outreach-seed.js --example > .outreach-contacts.json');
  process.exit(1);
}

const contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));

if (!Array.isArray(contacts) || contacts.length === 0) {
  console.error('Contacts file must be a non-empty JSON array.');
  process.exit(1);
}

function escapeSql(str) {
  if (!str) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function seed() {
  let inserted = 0;
  for (const c of contacts) {
    const sql = `INSERT INTO outreach_contacts (name, handle, platform, platform_url, language, category, audience_size, priority, status)
                 VALUES (${escapeSql(c.name)}, ${escapeSql(c.handle)}, ${escapeSql(c.platform)}, ${escapeSql(c.platform_url)}, ${escapeSql(c.language)}, ${escapeSql(c.category)}, ${escapeSql(c.audience_size)}, ${escapeSql(c.priority)}, 'pending')
                 ON CONFLICT DO NOTHING RETURNING id`;
    try {
      const result = execSync(`node scripts/db.js --write "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', cwd: __dirname + '/..' });
      const parsed = JSON.parse(result);
      if (parsed.length > 0) inserted++;
    } catch (e) {
      // duplicate or error, skip
    }
  }
  console.log(`Seeded ${inserted} new contacts. Total in DB: ${contacts.length} entries attempted.`);
}

// Show example JSON when --example is passed
if (args.includes('--example')) {
  const example = [
    { name: '<Name>', handle: '<handle>', platform: 'youtube', platform_url: 'https://www.youtube.com/@<handle>', language: '<lang>', category: 'creator', audience_size: 'large', priority: 'high' },
    { name: '<Name>', handle: '<handle>', platform: 'linkedin', platform_url: 'https://www.linkedin.com/in/<handle>', language: '<lang>', category: 'creator', audience_size: 'medium', priority: 'high' },
    { name: '<Company>', handle: '<handle>', platform: 'twitter', platform_url: 'https://twitter.com/<handle>', language: 'en', category: 'company', audience_size: 'large', priority: 'normal' },
  ];
  console.log(JSON.stringify(example, null, 2));
  process.exit(0);
}

seed();

#!/usr/bin/env node
/**
 * dashboard.js — Local web dashboard for job application pipeline.
 *
 * Serves a single-page dashboard at http://localhost:7531 that visualizes
 * the kanban pipeline, funnel stats, and recent activity from the DB.
 *
 * Usage:
 *   node scripts/dashboard.js                Start dashboard on port 7531
 *   node scripts/dashboard.js --port 8080    Use custom port
 *   node scripts/dashboard.js --open         Open in browser automatically
 *
 * The agent should open this at the end of a round (apply, news, daily)
 * so the user can visually review the pipeline status.
 *
 * No external dependencies beyond `pg` (already installed).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

const ACTIVE_STAGES = [
  'discovered', 'contacted', 'applied', 'in_review',
  'screening', 'interview', 'offer', 'hired',
];
const CLOSED_STAGES = ['rejected', 'withdrawn', 'skipped'];

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('No .env found. Run the onboarding skill first.');
    process.exit(1);
  }
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function getDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

async function fetchPipelineData() {
  const client = await getDb();
  try {
    // Active applications by stage
    const { rows: active } = await client.query(`
      SELECT id, platform, company, role, url, status, applied_at,
             data->>'match' as match, data->>'source' as source,
             data->>'location' as location
      FROM applications
      WHERE user_id = 1 AND status = ANY($1)
      ORDER BY CASE
        WHEN status = 'offer' THEN 0
        WHEN status = 'interview' THEN 1
        WHEN status = 'screening' THEN 2
        WHEN status = 'in_review' THEN 3
        WHEN status = 'applied' THEN 4
        WHEN status = 'contacted' THEN 5
        WHEN status = 'discovered' THEN 6
      END, applied_at DESC
    `, [ACTIVE_STAGES]);

    // Closed applications
    const { rows: closed } = await client.query(`
      SELECT id, platform, company, role, status, applied_at
      FROM applications
      WHERE user_id = 1 AND status = ANY($1)
      ORDER BY applied_at DESC
      LIMIT 20
    `, [CLOSED_STAGES]);

    // Funnel counts
    const { rows: funnel } = await client.query(`
      SELECT status, count(*) as count
      FROM applications
      WHERE user_id = 1
      GROUP BY status
    `);

    // Recent messages
    const { rows: messages } = await client.query(`
      SELECT id, channel, direction, sender, subject, status, received_at
      FROM messages
      WHERE user_id = 1
      ORDER BY COALESCE(received_at, sent_at) DESC
      LIMIT 10
    `).catch(() => ({ rows: [] }));

    // Company registrations summary
    const { rows: targets } = await client.query(`
      SELECT registration_status, count(*) as count
      FROM company_registrations
      WHERE user_id = 1
      GROUP BY registration_status
    `).catch(() => ({ rows: [] }));

    // Strategy
    const { rows: strategyRows } = await client.query(`
      SELECT data->'strategy' as strategy FROM users WHERE id = 1
    `).catch(() => ({ rows: [] }));

    // User name
    const { rows: userRows } = await client.query(`
      SELECT name FROM users WHERE id = 1
    `).catch(() => ({ rows: [{ name: '' }] }));

    // Last activity
    const { rows: lastActivity } = await client.query(`
      SELECT max(applied_at) as last_application FROM applications WHERE user_id = 1
    `);

    return {
      active,
      closed,
      funnel: funnel.reduce((acc, r) => { acc[r.status] = parseInt(r.count); return acc; }, {}),
      messages,
      targets: targets.reduce((acc, r) => { acc[r.registration_status] = parseInt(r.count); return acc; }, {}),
      strategy: strategyRows[0]?.strategy || null,
      userName: userRows[0]?.name || '',
      lastApplication: lastActivity[0]?.last_application || null,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await client.end();
  }
}

function getDashboardHTML() {
  return fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'templates', 'dashboard.html'), 'utf8');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 7531;
  let open = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) { port = parseInt(args[i + 1]); i++; }
    if (args[i] === '--open') open = true;
    if (args[i] === '-h' || args[i] === '--help') {
      console.log(`Usage: node scripts/dashboard.js [--port <n>] [--open]

  --port <n>   Port number (default: 7531)
  --open       Open in default browser automatically
`);
      process.exit(0);
    }
  }
  return { port, open };
}

function main() {
  loadEnv();
  const { port, open } = parseArgs();

  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/data') {
      try {
        const data = await fetchPipelineData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      const html = getDashboardHTML();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  Job Seeker Dashboard running at ${url}\n`);
    console.log(`  Press Ctrl+C to stop.\n`);

    if (open) {
      const { exec } = require('child_process');
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} ${url}`);
    }
  });
}

main();

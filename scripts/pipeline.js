#!/usr/bin/env node
/**
 * pipeline.js — Kanban board CLI for job applications and contacts.
 *
 * Reads from the `applications` table and prints a kanban-style board
 * grouped by pipeline stage. Supports moving cards, filtering, and
 * viewing card details with linked messages.
 *
 * Usage:
 *   node scripts/pipeline.js                          Print board (active cards)
 *   node scripts/pipeline.js --closed                 Include closed cards
 *   node scripts/pipeline.js --stage <stage>          Filter by single stage
 *   node scripts/pipeline.js --funnel                 Print counts per stage
 *   node scripts/pipeline.js --move <id> <stage>      Move card to new stage
 *   node scripts/pipeline.js --card <id>              Show card detail + messages
 *   node scripts/pipeline.js --company <name>         Filter by company name
 *   node scripts/pipeline.js -h|--help                This help
 *
 * No external dependencies. Uses `pg` (already installed) and raw ANSI codes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

// --- Pipeline stages (ordered left to right) ---
const ACTIVE_STAGES = [
  'discovered',
  'contacted',
  'applied',
  'in_review',
  'screening',
  'interview',
  'offer',
  'hired',
];

const CLOSED_STAGES = ['rejected', 'withdrawn', 'skipped'];

const ALL_STAGES = [...ACTIVE_STAGES, ...CLOSED_STAGES];

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  greenBright: '\x1b[92m',
};

const STAGE_COLOR = {
  discovered: C.gray,
  contacted: C.cyan,
  applied: C.blue,
  in_review: C.yellow,
  screening: C.magenta,
  interview: C.green,
  offer: C.greenBright,
  hired: C.bold + C.greenBright,
  rejected: C.red,
  withdrawn: C.dim,
  skipped: C.gray,
};

const STAGE_LABEL = {
  discovered: 'DISCOVERED',
  contacted: 'CONTACTED',
  applied: 'APPLIED',
  in_review: 'IN_REVIEW',
  screening: 'SCREENING',
  interview: 'INTERVIEW',
  offer: 'OFFER',
  hired: 'HIRED',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
  skipped: 'SKIPPED',
};

// --- .env parsing (same pattern as db.js, no dotenv dependency) ---
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    fail(`No .env found at ${envPath}. Run the onboarding skill first.`);
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function fail(msg, code = 1) {
  console.error(`[pipeline] ${msg}`);
  process.exit(code);
}

// --- arg parsing ---
const args = process.argv.slice(2);
const flags = {
  closed: args.includes('--closed'),
  funnel: args.includes('--funnel'),
  move: args.includes('--move'),
  card: args.includes('--card'),
  stage: args.includes('--stage'),
  company: args.includes('--company'),
  help: args.includes('-h') || args.includes('--help'),
};
const positional = args.filter((a) => !a.startsWith('-'));

function usage() {
  console.log(`Usage:
  node scripts/pipeline.js                          Print board (active cards)
  node scripts/pipeline.js --closed                 Include closed cards
  node scripts/pipeline.js --stage <stage>          Filter by single stage
  node scripts/pipeline.js --funnel                 Print counts per stage
  node scripts/pipeline.js --move <id> <stage>      Move card to new stage
  node scripts/pipeline.js --card <id>              Show card detail + messages
  node scripts/pipeline.js --company <name>         Filter by company name
  node scripts/pipeline.js -h|--help                This help

Stages (left to right):
  ${ACTIVE_STAGES.join(' -> ')}

Closed stages (shown with --closed):
  ${CLOSED_STAGES.join(', ')}`);
}

// --- helpers ---
function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function matchIndicator(match) {
  if (!match) return '';
  if (match === 'high') return '\u2605';
  if (match === 'medium') return '\u25c6';
  return '\u25cb';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso) {
  if (!iso) return '';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'just now';
  } catch {
    return '';
  }
}

// --- board printing ---
function printBoard(rows, includeClosed) {
  const stagesToShow = includeClosed ? ALL_STAGES : ACTIVE_STAGES;
  const byStage = {};
  for (const stage of stagesToShow) byStage[stage] = [];
  for (const row of rows) {
    if (byStage[row.status]) byStage[row.status].push(row);
  }

  const activeCount = rows.filter((r) => ACTIVE_STAGES.includes(r.status)).length;
  const closedCount = rows.filter((r) => CLOSED_STAGES.includes(r.status)).length;

  let header = `PIPELINE`;
  if (includeClosed) {
    header += ` \u2014 ${activeCount} active, ${closedCount} closed`;
  } else {
    header += ` \u2014 ${activeCount} active${closedCount > 0 ? `, ${closedCount} closed (use --closed)` : ''}`;
  }
  console.log(`\n${C.bold}${header}${C.reset}\n`);

  const colWidth = 52;
  for (const stage of stagesToShow) {
    const cards = byStage[stage];
    const color = STAGE_COLOR[stage] || C.reset;
    const label = STAGE_LABEL[stage] || stage.toUpperCase();
    const sep = '\u2500'.repeat(Math.max(0, colWidth - label.length - (String(cards.length).length + 3)));
    console.log(`${color}\u2500\u2500 ${label} (${cards.length}) ${sep}${C.reset}`);

    if (cards.length === 0) {
      console.log(`  ${C.dim}(empty)${C.reset}`);
    } else {
      for (const card of cards) {
        const id = `#${card.id}`.padEnd(5);
        const company = truncate(card.company, 20).padEnd(20);
        const role = truncate(card.role, 28);
        const mi = matchIndicator(card.data && card.data.match);
        const line = `  ${C.dim}${id}${C.reset} ${company} ${role}`;
        console.log(line + (mi ? ` ${mi}` : ''));

        // Interview/scheduling info
        if (card.data) {
          if (card.data.interview_date) {
            console.log(`       ${C.magenta}\u23F0 ${formatDate(card.data.interview_date)}${C.reset}`);
          }
          if (card.data.scheduled_at) {
            console.log(`       ${C.magenta}\u23F0 ${formatDate(card.data.scheduled_at)}${C.reset}`);
          }
        }
      }
    }
    console.log();
  }

  // Closed summary (if not showing closed columns)
  if (!includeClosed && closedCount > 0) {
    const closedByStage = {};
    for (const stage of CLOSED_STAGES) closedByStage[stage] = 0;
    for (const row of rows) {
      if (closedByStage[row.status] !== undefined) closedByStage[row.status]++;
    }
    const parts = CLOSED_STAGES.filter((s) => closedByStage[s] > 0)
      .map((s) => `${closedByStage[s]} ${s}`);
    console.log(`${C.dim}CLOSED: ${parts.join(' | ')}${C.reset}`);
  }
}

function printFunnel(rows) {
  const counts = {};
  for (const stage of ALL_STAGES) counts[stage] = 0;
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status]++;
  }

  console.log(`\n${C.bold}FUNNEL${C.reset}\n`);
  const maxCount = Math.max(...Object.values(counts), 1);
  const barWidth = 30;

  for (const stage of ALL_STAGES) {
    const count = counts[stage];
    const color = STAGE_COLOR[stage] || C.reset;
    const label = (STAGE_LABEL[stage] || stage.toUpperCase()).padEnd(14);
    const bar = '\u2588'.repeat(Math.round((count / maxCount) * barWidth));
    const numStr = String(count).padStart(3);
    console.log(`  ${color}${label}${C.reset} ${C.dim}${bar.padEnd(barWidth)}${C.reset} ${count}`);
  }
  console.log();
}

function printCardDetail(app, messages) {
  const color = STAGE_COLOR[app.status] || C.reset;
  console.log(`\n${C.bold}CARD #${app.id}${C.reset}`);
  console.log(`  Company:   ${app.company}`);
  console.log(`  Role:      ${app.role}`);
  console.log(`  Stage:     ${color}${STAGE_LABEL[app.status] || app.status}${C.reset}`);
  console.log(`  Platform:  ${app.platform}`);
  if (app.url) console.log(`  URL:       ${app.url}`);
  console.log(`  Applied:   ${formatDate(app.applied_at)} (${formatRelative(app.applied_at)})`);

  if (app.data) {
    if (app.data.match) console.log(`  Match:     ${matchIndicator(app.data.match)} ${app.data.match}`);
    if (app.data.source) console.log(`  Source:    ${app.data.source}`);
    if (app.data.location) console.log(`  Location:  ${app.data.location}`);
    if (app.data.interview_date) console.log(`  Interview: ${formatDate(app.data.interview_date)}`);
    if (app.data.scheduled_at) console.log(`  Scheduled: ${formatDate(app.data.scheduled_at)}`);
    if (app.data.tech && Array.isArray(app.data.tech) && app.data.tech.length > 0) {
      console.log(`  Tech:      ${app.data.tech.join(', ')}`);
    }
    if (app.data.stage_history && Array.isArray(app.data.stage_history)) {
      console.log(`  History:`);
      for (const h of app.data.stage_history) {
        console.log(`    ${formatDate(h.moved_at)}  ${h.from} -> ${h.stage}`);
      }
    }
  }

  if (messages && messages.length > 0) {
    console.log(`\n  ${C.bold}Messages (${messages.length})${C.reset}`);
    for (const m of messages) {
      const dir = m.direction === 'inbound' ? '<-' : '->';
      const status = m.status === 'sent' ? C.green : m.status === 'pending' ? C.yellow : C.dim;
      console.log(`  ${dir} ${m.channel} ${status}[${m.status}]${C.reset} ${formatDate(m.received_at || m.sent_at)}`);
      if (m.sender) console.log(`     from: ${m.sender}`);
      if (m.subject) console.log(`     subj: ${m.subject}`);
    }
  } else {
    console.log(`\n  ${C.dim}No linked messages${C.reset}`);
  }
  console.log();
}

// --- DB operations ---
async function getRows(client, opts = {}) {
  let sql = `SELECT id, user_id, platform, company, role, url, status, applied_at, data FROM applications WHERE user_id = 1`;
  const params = [];
  if (opts.stage) {
    params.push(opts.stage);
    sql += ` AND status = $1`;
  }
  if (opts.company) {
    params.push(`%${opts.company}%`);
    sql += ` AND company ILIKE $${params.length}`;
  }
  if (!opts.closed && !opts.stage) {
    const activeList = ACTIVE_STAGES.map((s) => `'${s}'`).join(',');
    sql += ` AND status IN (${activeList})`;
  }
  sql += ` ORDER BY applied_at DESC`;
  const r = await client.query(sql, params);
  return r.rows;
}

async function moveCard(client, id, newStage) {
  if (!ALL_STAGES.includes(newStage)) {
    fail(`Invalid stage: "${newStage}". Valid stages: ${ALL_STAGES.join(', ')}`);
  }

  // Get current state
  const cur = await client.query(
    `SELECT id, status, data FROM applications WHERE id = $1 AND user_id = 1`,
    [id]
  );
  if (cur.rows.length === 0) {
    fail(`Card #${id} not found.`);
  }
  const oldStatus = cur.rows[0].status;
  const oldData = cur.rows[0].data || {};

  if (oldStatus === newStage) {
    console.log(`Card #${id} is already in ${newStage}. No change.`);
    return;
  }

  // Build stage_history
  const history = oldData.stage_history || [];
  history.push({
    stage: newStage,
    moved_at: new Date().toISOString(),
    from: oldStatus,
  });

  // Update with jsonb_set for stage_history
  const newData = JSON.stringify({ ...oldData, stage_history: history });
  await client.query(
    `UPDATE applications SET status = $1, data = $2::jsonb WHERE id = $3 AND user_id = 1`,
    [newStage, newData, id]
  );

  const color = STAGE_COLOR[newStage] || C.reset;
  console.log(`Moved #${id} ${C.dim}${oldStatus}${C.reset} -> ${color}${newStage}${C.reset}`);
}

async function getCardDetail(client, id) {
  const appRes = await client.query(
    `SELECT id, user_id, platform, company, role, url, status, applied_at, data FROM applications WHERE id = $1 AND user_id = 1`,
    [id]
  );
  if (appRes.rows.length === 0) {
    fail(`Card #${id} not found.`);
  }
  const app = appRes.rows[0];
  const msgRes = await client.query(
    `SELECT id, channel, direction, sender, subject, body, status, received_at, sent_at FROM messages WHERE application_id = $1 ORDER BY COALESCE(received_at, sent_at) DESC`,
    [id]
  );
  printCardDetail(app, msgRes.rows);
}

// --- main ---
async function main() {
  if (flags.help) {
    usage();
    return;
  }

  const env = loadEnv(ENV_PATH);
  if (!env.DATABASE_URL) fail('DATABASE_URL is not set in .env');
  const connStr = env.DATABASE_URL.replace(
    /sslmode=(require|prefer|verify-ca)\b/i,
    'sslmode=verify-full'
  );

  const client = new Client({ connectionString: connStr });
  try {
    await client.connect();
  } catch (e) {
    fail(`Connection failed: ${e.message}`);
  }

  try {
    // --move <id> <stage>
    if (flags.move) {
      const id = parseInt(positional[0], 10);
      const newStage = positional[1];
      if (!id || !newStage) fail('--move requires <id> <stage>');
      await moveCard(client, id, newStage);
      return;
    }

    // --card <id>
    if (flags.card) {
      const id = parseInt(positional[0], 10);
      if (!id) fail('--card requires <id>');
      await getCardDetail(client, id);
      return;
    }

    // --funnel
    if (flags.funnel) {
      const rows = await getRows(client, { closed: true });
      printFunnel(rows);
      return;
    }

    // --stage <stage>
    if (flags.stage) {
      const stage = positional[0];
      if (!stage) fail('--stage requires a stage name');
      if (!ALL_STAGES.includes(stage)) {
        fail(`Invalid stage: "${stage}". Valid: ${ALL_STAGES.join(', ')}`);
      }
      const rows = await getRows(client, { stage, closed: true });
      printBoard(rows, true);
      return;
    }

    // --company <name>
    if (flags.company) {
      const name = positional[0];
      if (!name) fail('--company requires a name');
      const rows = await getRows(client, { company: name, closed: true });
      printBoard(rows, true);
      return;
    }

    // default: print board
    const rows = await getRows(client, { closed: flags.closed });
    printBoard(rows, flags.closed);
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(`Unexpected: ${e.message}`));

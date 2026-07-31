#!/usr/bin/env node
/**
 * db.js — Safe Postgres CLI for agents.
 *
 * Reads DATABASE_URL from .env (repo root), runs SQL, prints JSON.
 * Read-only by default. Writes require --write.
 *
 * Usage:
 *   node scripts/db.js "<sql>"            # SELECT -> JSON array
 *   node scripts/db.js "<sql>" --write    # INSERT/UPDATE/DELETE/DDL
 *   node scripts/db.js --tables           # list tables
 *   node scripts/db.js --schema <table>   # describe a table
 *   node scripts/db.js --ping             # check connection (masked)
 *
 * Never prints the connection string. Only shows masked host/db.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

// --- .env parsing (manual, no dotenv dependency) ---
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

function maskConn(url) {
  // postgresql://user:pass@host:port/db?... -> user@host/db (no creds)
  try {
    const u = new URL(url);
    return `${u.username}@${u.host}${u.pathname}`;
  } catch {
    return '<invalid connection string>';
  }
}

function fail(msg, code = 1) {
  console.error(`[db] ${msg}`);
  process.exit(code);
}

// --- arg parsing ---
const args = process.argv.slice(2);
const flags = {
  write: args.includes('--write'),
  tables: args.includes('--tables'),
  schema: args.includes('--schema'),
  ping: args.includes('--ping'),
  help: args.includes('-h') || args.includes('--help'),
};
const positional = args.filter((a) => !a.startsWith('-'));

const READ_ONLY_RE = /^\s*(select|with|show|explain|values|describe)\b/i;

function usage() {
  console.log(`Usage:
  node scripts/db.js "<sql>"             Run SQL (read-only by default, JSON out)
  node scripts/db.js "<sql>" --write     Run a write (INSERT/UPDATE/DELETE/DDL)
  node scripts/db.js --tables            List tables
  node scripts/db.js --schema <table>    Describe a table
  node scripts/db.js --ping              Check connection (masked)
  node scripts/db.js -h|--help           This help`);
}

async function main() {
  if (flags.help) {
    usage();
    return;
  }

  const env = loadEnv(ENV_PATH);
  if (!env.DATABASE_URL) fail('DATABASE_URL is not set in .env');
  // Normalize sslmode=require -> verify-full: pg already treats them as aliases
  // (same security), this just silences the deprecation warning without touching .env.
  const connStr = env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)\b/i, 'sslmode=verify-full');

  const client = new Client({ connectionString: connStr });

  try {
    await client.connect();
  } catch (e) {
    fail(`Connection failed: ${e.message}`);
  }

  // --ping
  if (flags.ping) {
    try {
      const r = await client.query('SELECT current_database() AS db, current_user AS user, version() AS version');
      const v = r.rows[0];
      console.log(JSON.stringify({
        ok: true,
        connection: maskConn(connStr),
        database: v.db,
        user: v.user,
        version: v.version.split(' ').slice(0, 2).join(' '),
      }, null, 2));
    } finally {
      await client.end();
    }
    return;
  }

  // --tables
  if (flags.tables) {
    try {
      const r = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name`);
      console.log(JSON.stringify(r.rows.map((x) => x.table_name), null, 2));
    } finally {
      await client.end();
    }
    return;
  }

  // --schema <table>
  if (flags.schema) {
    const table = positional[0];
    if (!table) fail('--schema requires a table name');
    try {
      const cols = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`, [table]);
      console.log(JSON.stringify(cols.rows, null, 2));
    } finally {
      await client.end();
    }
    return;
  }

  // raw SQL
  const sql = positional[0];
  if (!sql) {
    usage();
    await client.end();
    return;
  }

  const isReadOnly = READ_ONLY_RE.test(sql);
  if (!isReadOnly && !flags.write) {
    fail('Refusing to run a write without --write. Add --write to confirm.');
  }
  if (isReadOnly && flags.write) {
    // harmless but explicit warn
    console.error('[db] note: --write passed for a read-only statement (ignored)');
  }

  try {
    const r = await client.query(sql);
    if (r.command === 'SELECT') {
      console.log(JSON.stringify(r.rows, null, 2));
    } else {
      console.log(JSON.stringify({ rowCount: r.rowCount, command: r.command }, null, 2));
    }
  } catch (e) {
    fail(`Query failed: ${e.message}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(`Unexpected: ${e.message}`));

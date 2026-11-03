-- schema.sql — DDL for all tables documented in DATA.md.
-- Idempotent: safe to run against a fresh DB (onboarding) or an existing one
-- (CREATE TABLE IF NOT EXISTS skips tables that already exist).
--
-- Usage: psql "$DATABASE_URL" -f schema.sql
--   or:  node scripts/db.js "$(cat schema.sql)" --write   (if your db.js build supports multi-statement --write)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  platform TEXT,
  company TEXT,
  role TEXT,
  url TEXT,
  status TEXT DEFAULT 'applied',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS company_registrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  company TEXT NOT NULL,
  region TEXT,
  sector TEXT,
  careers_url TEXT,
  ats_platform TEXT,
  registration_status TEXT,
  profile_completed BOOLEAN DEFAULT FALSE,
  profile_url TEXT,
  login_method TEXT,
  applied_jobs_count INTEGER DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  last_applied_at TIMESTAMPTZ,
  notes TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, company)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  application_id INTEGER REFERENCES applications(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  channel TEXT,
  direction TEXT,
  sender TEXT,
  subject TEXT,
  body TEXT,
  draft TEXT,
  status TEXT,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  source TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, category, key)
);

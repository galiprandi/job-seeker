-- schema.sql — DDL generated from the live production schema.
-- Idempotent: CREATE TABLE IF NOT EXISTS — safe on fresh and existing DBs.
-- Usage: psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS applications (
  id SERIAL NOT NULL,
  user_id INTEGER,
  platform TEXT,
  company TEXT,
  role TEXT,
  url TEXT,
  status TEXT DEFAULT 'applied'::text,
  applied_at TIMESTAMPTZ DEFAULT now(),
  data JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (user_id) REFERENCES users(id),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS career_portals (
  id SERIAL NOT NULL,
  user_id INTEGER,
  company TEXT NOT NULL,
  portal_url TEXT,
  ats_platform TEXT,
  status TEXT DEFAULT 'pending'::text,
  username TEXT,
  email TEXT,
  profile_completeness INTEGER DEFAULT 0,
  notes TEXT,
  registered_at TIMESTAMPTZ DEFAULT now(),
  data JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (user_id) REFERENCES users(id),
  PRIMARY KEY (id),
  UNIQUE (user_id, company)
);

CREATE TABLE IF NOT EXISTS company_registrations (
  id SERIAL NOT NULL,
  user_id INTEGER,
  company TEXT NOT NULL,
  region TEXT,
  careers_url TEXT,
  ats_platform TEXT,
  registration_status TEXT DEFAULT 'pending'::text,
  profile_completed BOOLEAN DEFAULT false,
  profile_url TEXT,
  credentials_note TEXT,
  applied_jobs_count INTEGER DEFAULT 0,
  last_visit_at TIMESTAMPTZ,
  notes TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  sector TEXT,
  last_applied_at TIMESTAMPTZ,
  login_method TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  PRIMARY KEY (id),
  UNIQUE (user_id, company)
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL NOT NULL,
  application_id INTEGER,
  user_id INTEGER,
  channel TEXT,
  direction TEXT,
  sender TEXT,
  subject TEXT,
  body TEXT,
  draft TEXT,
  status TEXT DEFAULT 'pending'::text,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (application_id) REFERENCES applications(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS outreach_contacts (
  id SERIAL NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  platform TEXT NOT NULL,
  platform_url TEXT,
  email TEXT,
  language TEXT DEFAULT 'en'::text,
  category TEXT NOT NULL,
  audience_size TEXT,
  status TEXT DEFAULT 'pending'::text,
  priority TEXT DEFAULT 'normal'::text,
  notes TEXT,
  contacted_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id SERIAL NOT NULL,
  contact_id INTEGER,
  channel TEXT NOT NULL,
  direction TEXT DEFAULT 'outbound'::text,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft'::text,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (contact_id) REFERENCES outreach_contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS outreach_posts (
  id SERIAL NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  url TEXT,
  status TEXT DEFAULT 'draft'::text,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS preferences (
  id SERIAL NOT NULL,
  user_id INTEGER,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  source TEXT DEFAULT 'explicit_statement'::text,
  status TEXT DEFAULT 'active'::text,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (user_id) REFERENCES users(id),
  PRIMARY KEY (id),
  UNIQUE (user_id, category, key)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (id),
  UNIQUE (email)
);

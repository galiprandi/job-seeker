#!/usr/bin/env node
/**
 * Seeds outreach_posts with draft posts for each platform.
 * Run: node scripts/outreach-posts-seed.js
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { getSocial } = require('./social');
const social = getSocial();
const GITHUB_URL = social.github_repo_url || 'https://github.com/<your-username>/<your-repo>';
const DOCS_URL = social.docs_url || 'https://<your-username>.github.io/<your-repo>/';

// Manual .env parsing (no dotenv dependency, same as db.js)
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim();
}

const pool = new Pool({ connectionString: env.DATABASE_URL });

const posts = [
  {
    platform: 'linkedin',
    post_type: 'en',
    title: 'LinkedIn Post EN',
    body: `I built an open source tool that lets your AI coding agent search, filter, and apply to jobs for you.

It's called Job Seeker. It's not another job board. It's a set of skills that any coding agent (Devin, Claude, Cursor, opencode) can consume to automate your job search end to end.

Here's what it does:
- Reads your CV and learns your preferences (Must-haves, Nice-to-haves)
- Searches LinkedIn with your filters
- Fills Easy Apply forms with your data from a Postgres DB
- Tracks every application in a kanban pipeline
- Drafts replies to recruiters in your writing style
- Opens a dashboard so you can review everything

The average job seeker spends 5-8 hours per week on repetitive applications. This cuts it to minutes.

Your personal data never touches the repo. Everything lives in your own Neon Postgres DB. Clone it, run onboarding, and the agent handles the rest.

It's MIT licensed and works with any agent that reads markdown skills.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}

If you're job hunting or know someone who is, give it a star. It helps others find it too.

#opensource #ai #jobsearch #automation #career #codingagent`,
    status: 'draft',
  },
  {
    platform: 'linkedin',
    post_type: 'es',
    title: 'LinkedIn Post ES',
    body: `Construi una herramienta open source que deja que tu agente de IA (Devin, Claude, Cursor, opencode) busque, filtre y aplique a empleos por vos.

Se llama Job Seeker. No es otro portal de empleos. Son skills que cualquier coding agent consume para automatizar tu busqueda laboral de punta a punta.

Que hace:
- Lee tu CV y aprende tus preferencias (Must-haves, Nice-to-haves)
- Busca en LinkedIn con tus filtros
- Llena formularios de Easy Apply con tus datos desde una DB Postgres
- Trackea cada postulacion en un kanban pipeline
- Redacta respuestas a reclutadores en tu estilo
- Abre un dashboard para que revises todo

El promedio de alguien buscando trabajo gasta 5-8 horas por semana en aplicaciones repetitivas. Esto lo reduce a minutos.

Tus datos personales nunca tocan el repo. Todo vive en tu propia DB de Neon Postgres. Clonas, corres onboarding, y el agente maneja el resto.

Es MIT y funciona con cualquier agente que lea skills en markdown.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}

Si estas buscando trabajo o conoces a alguien que si, dale una estrella. Ayuda a que otros lo encuentren.

#opensource #ia #busquedalaboral #automatizacion #carrera`,
    status: 'draft',
  },
  {
    platform: 'reddit',
    post_type: 'r/SideProject',
    title: 'I open sourced a tool that lets your AI coding agent apply to jobs for you',
    body: `After months of job searching manually and wasting hours on repetitive Easy Apply forms, I built Job Seeker: an open source set of skills that any coding agent (Devin, Claude, Cursor, opencode) can consume to automate the entire job search pipeline.

**What it does:**
- Reads your CV and extracts a structured profile with Must/Strong/Nice preference weights
- Searches LinkedIn with your filters (role, location, modality, salary, AI focus, etc.)
- Applies via Easy Apply automatically, filling forms with your data from a Postgres DB
- Tracks every application in a kanban pipeline (discovered -> applied -> interviewing -> hired)
- Drafts replies to recruiters in your writing style (you approve before sending)
- Runs a daily routine: check for updates, clean inbox, apply if no recent activity
- Opens a local web dashboard with funnel charts, KPIs, and target company tracking

**How it works:**
It's not an agent itself. It's markdown skills + Node.js scripts that your coding agent reads and executes. Your agent (Devin, Claude, Cursor, etc.) loads the skills, uses a playwright-cli wrapper for browser automation, and stores everything in a Postgres DB (Neon recommended for portability).

**Key design decisions:**
- Candidate-agnostic: no personal data in the repo, everything in your DB
- Browser isolation: dedicated Chrome profile, headless by default, headed for logins/2FA
- Strategy levels: passive, selective, active, aggressive (controls batch size, frequency, match threshold)
- 9 flows: onboarding, profile, strategy, radar, targets, news, apply, daily, memory
- 35 platform catalog for sourcing

**Stack:** Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest for tests

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}
Demo video: ${GITHUB_URL}/releases/download/v0.1.0/demo-terminal.webm

MIT licensed. Would love feedback, especially on the skill format and browser wrapper design.`,
    status: 'draft',
  },
  {
    platform: 'reddit',
    post_type: 'r/webdev',
    title: 'Open source: AI agent skills that automate your job search (LinkedIn Easy Apply, tracking, recruiter replies)',
    body: `I open sourced Job Seeker, a set of skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate job searching.

It's not a SaaS or a job board. It's markdown skills + Node.js scripts that your agent reads and executes. Your agent does the browser automation via playwright-cli, stores data in Postgres, and you approve what matters.

**Flows:**
- onboarding: browser setup, Gmail + LinkedIn login, DB creation
- profile: CV extraction + 30-preference questionnaire with Must/Strong/Nice weights
- strategy: passive/selective/active/aggressive levels that control batch sizes and frequency
- apply: LinkedIn search + Easy Apply with form data from DB
- news: Gmail + LinkedIn inbox review, draft replies in your style
- daily: runs news + apply automatically
- radar: register on job boards, set up alerts
- targets: apply directly to 40 target companies' career sites
- memory: detects preferences from conversation, saves to DB automatically

**Why I built it:**
I was spending 5-8 hours per week on repetitive applications. Easy Apply forms ask the same 15 questions every time. Recruiter messages pile up. Tracking is a mess. This automates all of it.

Repo: ${GITHUB_URL}

MIT licensed. Feedback welcome.`,
    status: 'draft',
  },
  {
    platform: 'reddit',
    post_type: 'r/cscareerquestions',
    title: 'Open sourced a tool that automates job applications with AI agents',
    body: `I got tired of spending hours filling out the same Easy Apply forms and tracking applications in spreadsheets, so I built Job Seeker and open sourced it.

It's a set of skills that your coding agent (Devin, Claude, Cursor, opencode) reads to automate your job search:

- Searches LinkedIn with your Must-have filters
- Fills Easy Apply forms automatically (data from your Postgres DB, no guessing)
- Tracks every application in a kanban pipeline
- Drafts replies to recruiters in your writing style
- Runs a daily routine to check for updates and apply if needed

You stay in control. The agent does the repetitive work, you approve what matters.

Your personal data lives in your own Neon Postgres DB, not in the repo. Clone it, run onboarding, and you're set.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}

MIT licensed. Would appreciate a star if it's useful.`,
    status: 'draft',
  },
  {
    platform: 'hn',
    post_type: 'Show HN',
    title: 'Show HN: Job Seeker – Open source skills that let your AI agent apply to jobs for you',
    body: `Hi HN,

I open sourced Job Seeker, a set of markdown skills and Node.js scripts that any coding agent (Devin, Claude, Cursor, opencode) can consume to automate the job search pipeline.

The idea: instead of building yet another job board or SaaS, give your existing coding agent the skills to do what a human job seeker does, but faster. The agent reads your CV, learns your preferences, searches LinkedIn, fills Easy Apply forms, tracks applications in Postgres, and drafts replies to recruiters in your writing style.

Key design decisions:

1. Skills as markdown, not code. Any agent that reads markdown can use them. No vendor lock-in.
2. Candidate-agnostic repo. No personal data in any tracked file. Everything lives in the user's own Neon Postgres DB. Clone, run onboarding, done.
3. Browser isolation via playwright-cli wrapper. Dedicated Chrome profile, headless by default, headed only for manual login and 2FA. The agent never handles credentials.
4. Strategy levels (passive/selective/active/aggressive) that control batch sizes, frequency, match thresholds, and which Must-haves to relax. The user picks a level and all flows respect it.
5. Anti-LLM message drafting. Recruiter replies pass a checklist: no em-dashes, no bullet points in DMs, conversational tone, max 2 short paragraphs, mimic the user's style profile from DB.
6. Form data from DB only. The agent never invents values. If a field is missing, it stops and asks the user, then saves the answer for next time.

9 flows: onboarding, profile, strategy, radar (passive alerts), targets (direct to company career sites), news (inbox review + drafts), apply (LinkedIn Easy Apply), daily (routine), memory (autonomous preference detection).

Stack: Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}
Demo: ${GITHUB_URL}/releases/download/v0.1.0/demo-terminal.webm

I'd love feedback on the skill format, the browser wrapper design, and the strategy level system. The platform catalog (PLATFORMS.md) is community-maintained and contributions are welcome.`,
    status: 'draft',
  },
  {
    platform: 'dev.to',
    post_type: 'article',
    title: 'How I automated my job search with AI coding agents (open source)',
    body: `![Job Seeker Dashboard](${GITHUB_URL}/raw/main/assets/dashboard-light.png)

After months of manually scrolling job boards and filling the same Easy Apply form 200 times, I decided to automate it. But not with a SaaS or a Chrome extension. With the coding agent I already use every day.

## The problem

The average tech job seeker spends 5-8 hours per week on:
- Searching LinkedIn with the same filters
- Filling Easy Apply forms that ask the same 15 questions
- Tracking applications in a spreadsheet that's always out of date
- Drafting replies to recruiters while trying not to sound like a robot
- Forgetting which companies they already applied to

## The solution: skills, not code

I built Job Seeker, an open source set of markdown skills that any coding agent (Devin, Claude, Cursor, opencode) can consume. Your agent reads the skills, uses a playwright-cli wrapper for browser automation, and stores everything in a Postgres database.

It's not an agent. It's the instructions and scripts that make your agent a job search assistant.

## How it works

\`\`\`
You: "apply to 5 jobs"
  -> Agent loads your profile from DB
  -> Searches LinkedIn with your Must-have filters
  -> Applies via Easy Apply (form data from DB)
  -> Registers every application
  -> Shows you a summary
\`\`\`

## 9 flows

| Flow | What it does |
|---|---|
| onboarding | Browser setup, Gmail + LinkedIn login, DB creation |
| profile | CV extraction + 30-preference questionnaire with Must/Strong/Nice weights |
| strategy | passive/selective/active/aggressive levels |
| apply | LinkedIn search + Easy Apply |
| news | Gmail + LinkedIn inbox review, draft replies |
| daily | Runs news + apply automatically |
| radar | Register on job boards, set up alerts |
| targets | Apply directly to 40 target companies |
| memory | Autonomous preference detection and storage |

## Key design decisions

**1. Skills as markdown.** Any agent that reads markdown can use them. No vendor lock-in, no API keys, no SaaS dependency.

**2. Candidate-agnostic repo.** No personal data in any tracked file. Everything lives in your own Neon Postgres DB. Clone, run onboarding, done.

**3. Browser isolation.** Dedicated Chrome profile via playwright-cli wrapper. Headless by default, headed only for manual login and 2FA. The agent never handles credentials.

**4. Strategy levels.** passive, selective, active, aggressive. Each controls batch sizes, frequency, match thresholds, and which Must-haves to relax. Pick a level and all flows respect it.

**5. Anti-LLM messages.** Recruiter replies pass a checklist: no em-dashes, no bullet points in DMs, conversational tone, max 2 short paragraphs, mimic the user's style profile from DB.

**6. Form data from DB only.** The agent never invents values. If a field is missing, it stops, asks the user, saves the answer, and continues.

## Try it

\`\`\`bash
git clone ${GITHUB_URL}.git
cd job-seeker
npm install
\`\`\`

Create a \`.env\` with your Neon Postgres connection string, then tell your coding agent: "run the onboarding skill."

After onboarding: "apply to 5 jobs" or "check for updates."

## Links

- **Repo:** ${GITHUB_URL}
- **Docs:** ${DOCS_URL}
- **Demo:** ${GITHUB_URL}/releases/download/v0.1.0/demo-terminal.webm

MIT licensed. If it helps you, give it a star.`,
    status: 'draft',
  },
  {
    platform: 'twitter',
    post_type: 'thread_en',
    title: 'Twitter/X Thread EN',
    body: `1/ I open sourced a tool that lets your AI coding agent apply to jobs for you.

It's called Job Seeker. Thread.

2/ Job Seeker is a set of markdown skills that any coding agent (Devin, Claude, Cursor, opencode) consumes to automate your job search.

Not a SaaS. Not a Chrome extension. Skills your agent reads and executes.

3/ What it does:
- Reads your CV, learns your preferences
- Searches LinkedIn with your Must-have filters
- Fills Easy Apply forms with data from your Postgres DB
- Tracks every application in a kanban pipeline
- Drafts recruiter replies in your writing style

4/ Your personal data never touches the repo. Everything lives in your own Neon Postgres DB. Clone, run onboarding, done.

Candidate-agnostic by design.

5/ 9 flows:
onboarding, profile, strategy, radar, targets, news, apply, daily, memory

Strategy levels: passive, selective, active, aggressive. Pick one and all flows respect it.

6/ Browser isolation via playwright-cli. Dedicated Chrome profile. Headless by default, headed for logins/2FA. The agent never handles credentials.

7/ Anti-LLM message drafting. Recruiter replies pass a checklist: no em-dashes, no bullets in DMs, conversational tone, max 2 paragraphs, mimic your style from DB.

8/ Stack: Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest

MIT licensed. Works with any agent that reads markdown.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}

If it's useful, give it a star.`,
    status: 'draft',
  },
  {
    platform: 'twitter',
    post_type: 'thread_es',
    title: 'Twitter/X Thread ES',
    body: `1/ Open source una herramienta que deja que tu agente de IA aplique a empleos por vos.

Se llama Job Seeker. Hilo.

2/ Job Seeker es un set de skills en markdown que cualquier coding agent (Devin, Claude, Cursor, opencode) consume para automatizar tu busqueda laboral.

No es un SaaS. No es una extension. Son skills que tu agente lee y ejecuta.

3/ Que hace:
- Lee tu CV, aprende tus preferencias
- Busca en LinkedIn con tus filtros Must-have
- Llena formularios Easy Apply con datos de tu DB Postgres
- Trackea cada postulacion en un kanban
- Redacta respuestas a reclutadores en tu estilo

4/ Tus datos personales nunca tocan el repo. Todo vive en tu propia DB de Neon Postgres. Clonas, corres onboarding, listo.

Candidate-agnostic by design.

5/ 9 flows:
onboarding, profile, strategy, radar, targets, news, apply, daily, memory

Niveles de estrategia: passive, selective, active, aggressive. Elegis uno y todos los flows lo respetan.

6/ Browser isolation con playwright-cli. Chrome profile dedicado. Headless por defecto, headed para logins/2FA. El agente nunca maneja tus credenciales.

7/ Anti-LLM en mensajes. Las respuestas a reclutadores pasan un checklist: sin em-dashes, sin bullets en DMs, tono conversacional, max 2 parrafos, imita tu estilo desde la DB.

8/ Stack: Node.js 22+, playwright-cli, PostgreSQL (Neon), Vitest

MIT. Funciona con cualquier agente que lea markdown.

Repo: ${GITHUB_URL}
Docs: ${DOCS_URL}

Si te sirve, dale una estrella.`,
    status: 'draft',
  },
];

async function seed() {
  let inserted = 0;
  for (const p of posts) {
    try {
      const res = await pool.query(
        `INSERT INTO outreach_posts (platform, post_type, title, body, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING RETURNING id`,
        [p.platform, p.post_type, p.title, p.body, p.status]
      );
      if (res.rows.length > 0) inserted++;
    } catch (e) {
      console.error(`Error inserting ${p.platform}/${p.post_type}: ${e.message}`);
    }
  }
  const total = await pool.query('SELECT count(*) as total FROM outreach_posts');
  console.log(`Inserted ${inserted} posts. Total in DB: ${total.rows[0].total}`);
  await pool.end();
}

seed();

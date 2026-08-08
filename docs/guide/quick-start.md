# Quick Start

## 1. Clone and install

```bash
git clone https://github.com/galiprandi/job-seeker.git
cd job-seeker
npm install
```

## 2. Create your database

Create a free Postgres database on [Neon](https://neon.tech) (or use any Postgres provider).

Create a `.env` file in the repo root:

```
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
```

## 3. Run onboarding

Open your coding agent (Devin, Claude, Cursor, opencode) in the repo and say:

> "run the onboarding skill"

The agent will:
1. Open a headed browser for you to log into Gmail and LinkedIn
2. Create your Neon database (or use your existing connection string)
3. Save your profile URL and basic info to the DB
4. Ask about your browser mode preference (headless, headed, or headed for logins only)
5. Ask about your job search strategy level (passive, selective, active, aggressive)
6. Ask about your interview availability preferences

## 4. Set up your profile

After onboarding, say:

> "profile"

The agent will ask for your CV, LinkedIn profile, and run a 30-question profiling questionnaire. Your answers get Must/Strong/Nice weights that the agent uses to filter jobs.

## 5. Start applying

```bash
# Apply to 5 jobs via LinkedIn Easy Apply
"apply to 5 jobs"

# Check for recruiter updates
"news"

# Run the full daily routine
"daily"
```

## Next steps

- [How It Works](/guide/how-it-works) - understand the full flow cycle
- [Flows](/guide/flows) - explore all 9 flows
- [Strategy Levels](/guide/strategy) - configure your search aggressiveness
- [Platforms](/reference/platforms) - browse the 35-platform catalog

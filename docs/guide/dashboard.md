# Dashboard

A local web dashboard that visualizes your job application pipeline in real time. The agent opens it at the end of each round so you can review the results visually.

## Launch

```bash
node scripts/dashboard.js --open
```

This starts a local server at `http://localhost:7531` and opens it in your default browser.

### Options

| Flag | Description | Default |
|---|---|---|
| `--port <n>` | Port number | 7531 |
| `--open` | Open in default browser automatically | false |
| `-h, --help` | Show help | |

### When the agent opens it

The dashboard skill triggers at the end of any round that changes the pipeline:

- After `apply` finishes applying to jobs
- After `news` finishes processing updates
- After `daily` completes its routine
- After `targets` finishes registering or applying
- When you say `dashboard`, "show me the pipeline", or "show dashboard"

## What it shows

### Stats bar

Five key metrics at the top:

| Stat | What it counts |
|---|---|
| Active | Applications in any active stage (discovered through hired) |
| In Interview | Applications in screening or interview stages |
| Offers | Applications with an offer |
| Rejected | Applications rejected |
| Closed | Total closed (rejected + withdrawn + skipped) |

### Pipeline funnel

A bar chart showing the count at each pipeline stage, plus stage-to-stage conversion rates. The funnel flows left to right: discovered -> contacted -> applied -> in_review -> screening -> interview -> offer -> hired.

### Kanban board

Eight columns, one per active stage. Each card shows:

- Company name
- Role title
- Match level (Must, Strong, or Nice)
- Platform (linkedin, email, etc.)
- Relative date (just now, 5m ago, 3d ago)

Cards have hover and focus states. The board scrolls horizontally if columns don't fit.

### Target companies

A summary of target company registration status (pending, registered, no fit, manual login needed, etc.) shown as pills.

### Recent messages

The last 10 recruiter or contact messages with channel (Gmail, LinkedIn, platform), sender, subject, status (pending, draft, sent, ignored), and date.

## Auto-refresh

The dashboard fetches fresh data from the database every 30 seconds. You can keep it open during a session and watch the pipeline update in real time as the agent applies to jobs or processes messages.

## Data source

All data comes from the `applications`, `messages`, and `company_registrations` tables in your Postgres database. The dashboard is read-only. To move cards between stages, use the CLI:

```bash
node scripts/pipeline.js --move <id> <stage>
```

## Stopping the server

Press `Ctrl+C` in the terminal where the dashboard is running.

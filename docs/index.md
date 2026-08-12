---
layout: home

hero:
  name: Job Seeker
  text: Automate your job search
  tagline: Skills, guides, and scripts that any coding agent consumes to search, apply, and track jobs on your behalf. No coding experience needed.
  image:
    src: /social-preview.png
    alt: Job Seeker
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/galiprandi/job-seeker

features:
  - title: 9 Flows
    details: Onboarding, profile, strategy, radar, targets, news, apply, daily, and memory. Each flow is a skill your agent reads and executes.
    icon: 🔄
  - title: 35 Platforms
    details: Community-maintained catalog across general, tech, AI, executive, and latam categories. The agent picks platforms based on your profile.
    icon: 🌐
  - title: 12 Data-Backed Strategies
    details: Job search and networking strategies ordered by effectiveness, with response rates and hire rates from real research data.
    icon: 📊
  - title: Candidate-Agnostic
    details: No personal data in the repo. Everything lives in your Postgres database. Clone, run onboarding, and your profile persists across machines.
    icon: 🔒
  - title: Anti-LLM Messages
    details: Built-in checklist ensures recruiter replies sound human, not like ChatGPT. No em-dashes, no bullet points, conversational tone.
    icon: ✍️
  - title: Works With Any Agent
    details: Devin, Claude, Cursor, opencode. Skills are plain markdown in .agents/skills/. Universal format, not tied to one agent.
    icon: 🤖
---

## No coding experience? You're in the right place

You don't need to know how to code. If you use an AI coding agent like **[Claude Code](https://claude.com/product/claude-code)**, **[Codex](https://openai.com/codex)**, or **[Antigravity](https://antigravity.google/)** (all have free options), just copy and paste this prompt into it:

```text
Clone the repository https://github.com/galiprandi/job-seeker, run npm install, then read AGENTS.md and .agents/skills/onboarding/SKILL.md and run the onboarding flow. Walk me through each step and ask for anything you need (LinkedIn/Gmail logins, a Neon Postgres connection string, etc.).
```

That's it. The agent will clone the repo, install dependencies, and walk you through onboarding step by step. It will ask you to log into LinkedIn and Gmail manually (in a visible browser window) and to provide a free Postgres connection string from [Neon](https://neon.tech). After that, you just talk to it in plain language: "apply to 5 jobs", "check for updates", "run the daily routine".

## What it does

Job Seeker turns your coding agent into a job search assistant that handles the repetitive work while you stay in control:

- **Searches** LinkedIn and 35 other platforms for jobs matching your profile
- **Applies** via Easy Apply with your data from the database (no inventing answers)
- **Tracks** every application in a kanban pipeline with a visual dashboard
- **Drafts** replies to recruiters that pass an anti-LLM checklist before you see them
- **Remembers** your preferences and updates them as you state them in conversation

You approve what matters. The agent does the grunt work.

## Who is it for?

**Tech professionals** who use LinkedIn as their primary job platform and want to automate the boring part of job searching.

**Non-technical users** who already have an AI coding agent and want it to handle their job search. If you can copy and paste a prompt, you can use Job Seeker.

**Recruiters and HR professionals** who want to help candidates apply more efficiently, or who want to understand how AI agents are changing the job search landscape.

## Show your support

Job Seeker is free and open source. If it helps you, here are three ways to support the project:

<CTACard
  icon="⭐"
  title="Star the repo on GitHub"
  description="Stars help other people discover Job Seeker. It takes one click."
  href="https://github.com/galiprandi/job-seeker"
  cta="Star"
/>

<CTACard
  icon="💬"
  title="Leave a comment or idea"
  description="Found a bug, have a question, or want to suggest a feature? Open an issue or join the discussion."
  href="https://github.com/galiprandi/job-seeker/issues"
  cta="Comment"
/>

<CTACard
  icon="▶️"
  title="Watch the demo"
  description="See the apply flow in action, from search to application to kanban tracking."
  href="https://github.com/galiprandi/job-seeker/releases/download/v0.1.0/demo-terminal.webm"
  cta="Watch"
/>

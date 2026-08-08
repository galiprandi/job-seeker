# Introduction

Job Seeker is a set of **skills, guides, and scripts** that any coding agent (Devin, Claude, Cursor, opencode) consumes to search, apply, and track jobs on your behalf. It's not an agent. It's the knowledge you give your agent so it works the way you would.

## Why?

Job searching is repetitive. You scroll the same boards every day, fill the same forms, write the same cover letters, and track applications in a spreadsheet. An AI agent can do most of this for you, but it needs structured knowledge to do it well.

Job Seeker gives your agent that knowledge: what your profile is, what your Must-haves are, where to search, how to apply, how to draft messages that sound human, and how to track everything in a database.

## What it does

- **Searches** LinkedIn and 35 other platforms for jobs matching your profile
- **Filters** by Must-haves, Strong-haves, and Nice-to-haves so you only apply to relevant jobs
- **Applies** via Easy Apply with form data from your database (no inventing answers)
- **Tracks** every application in a kanban pipeline with full audit trail
- **Drafts** replies to recruiters that pass an anti-LLM checklist before you see them
- **Monitors** your inbox and LinkedIn for updates, classifies them by priority
- **Remembers** your preferences and updates them as you state them in conversation

## What it doesn't do

- It doesn't log in with your credentials. Manual login is always headed (visible browser)
- It doesn't solve captchas. When a captcha appears, it stops and asks you
- It doesn't send messages without your approval. You always see a draft first
- It doesn't invent personal data. If a form field is missing from the DB, it asks you

## Who is it for?

Works best for tech professionals who use LinkedIn as their primary job platform and Gmail for email. The system is designed to be extensible to other platforms.

## Requirements

- Node.js 22+
- npx
- A LinkedIn account
- A Gmail account
- A Postgres database (Neon recommended, free tier works)

`npm install` handles all dependencies, including `playwright-cli` and `pg`.

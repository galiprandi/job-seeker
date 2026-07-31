---
name: onboarding
description: Initial environment setup. Browser, logins, DB, user data.
trigger: onboarding
---
# Onboarding

## Steps

1. Verify `node` and `npx`
2. `.gitignore`: `.browser-profile/`, `.playwright-cli/`, `.env`, `node_modules/`
3. `npm init -y && npm install pg && npm install --save-dev @types/pg`
4. Open headed browser (requires manual login): `npx @playwright/cli open --profile=.browser-profile --headed --browser=chrome <url>`
5. Ask for email. Navigate to provider login (Gmail → accounts.google.com, Outlook → outlook.live.com). Fill email with `fill`, click Next, wait for manual auth + 2FA
6. Validate session: navigate to inbox, confirm URL doesn't redirect to login
7. Ask if user has a connection string or wants to create a DB on Neon
8. If create: navigate to console.neon.tech, login with Google (reuse session), "New project", name `job-seeker`, nearest region, Create. Read connection string (Show password + eval to extract)
9. Save connection string to `.env` as `DATABASE_URL`
10. Ask for user's name
11. Create `users` table and insert record:
    ```sql
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      data JSONB DEFAULT '{}'
    );
    INSERT INTO users (name, email, data) VALUES (..., ..., '{}')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
    ```
12. Navigate to linkedin.com/login. Wait for manual auth + 2FA
13. Validate session: navigate to linkedin.com/feed/
14. Save LinkedIn profile URL to `users.data.linkedin_profile` (jsonb_set)
15. Collect user info from all logged-in sites (LinkedIn, Gmail/Google): name, photo, phone, email. Save to `users.data` as JSONB. Useful for aligning profiles on other job platforms
16. Check if profiles need updating (inconsistent data across sites). Report to user
17. Close browser

## Rules

- Full autonomy. Only ask for intervention to: data that can't be inferred, manual login, 2FA
- Email login first, LinkedIn second
- Validate session after each login
- `.env` not tracked
- Custom schema: only create tables when needed
- JSONB for semi-structured data in `users.data`
- Single user (repo owner)

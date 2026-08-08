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
4. **Ask user about browser visibility preference**. Present these options and save the answer to `preferences` before opening any browser:
   - `headless` — Headless always. The agent works without showing the browser. Manual login/2FA remains headed (Gold Rule 5)
   - `headed` — Headed always. The user sees everything the agent does on screen
   - `headed_logins_only` — Headed only for logins/2FA, headless for everything else (default)
   - `ask_each_time` — The agent asks before each browser session whether the user wants to see it or not

   Save the preference:
   ```bash
   node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, 'tooling', 'browser_mode', '<chosen_value>', 1.0, 'explicit_statement') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()" --write
   ```
   The agent must respect this preference in **all flows** that use the browser. Load it at every pre-flight:
   ```bash
   node scripts/db.js "SELECT value FROM preferences WHERE user_id = 1 AND category = 'tooling' AND key = 'browser_mode' AND status = 'active'"
   ```
   If no preference exists, default to `headed_logins_only`.
4b. **Ask user about job search strategy level.** Present the situation and ask which fits (see AGENTS.md "Strategy levels"):
   - `passive` — Employed, open to opportunities. No auto-apply, only monitors alerts
   - `selective` — Employed, looking for something better. Applies to Must-matches, 5 per session
   - `active` — Unemployed or about to be. Applies to Must+Strong, 10 per session, faster follow-ups
   - `aggressive` — Needs a job now. Applies to all matches, 15 per session, relaxes Must-haves (remote, manager)

   Ask these questions to help the user decide:
   1. Are you currently employed?
   2. How urgent is your search? (no urgency / in the coming months / now / desperate)
   3. Would you accept IC roles or only Manager?
   4. Would you accept hybrid if the project is really good?
   5. Do you want me to apply automatically or just show you options?

   Based on answers, propose a level. Allow the user to confirm or adjust. Then save:
   ```bash
   # Save level to preferences
   node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, 'workflow', 'strategy_level', '<level>', 1.0, 'explicit_statement') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()" --write
   # Save detailed parameters to users.data.strategy
   node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{strategy}', '<json>'::jsonb) WHERE id = 1" --write
   ```
   The strategy JSON should contain all parameters (see AGENTS.md "Strategy levels" for the schema per level). If the user customizes any parameter, override the default for that level.
   If no strategy is set, default to `selective`.
4c. **Ask user about interview availability preferences.** This saves time later when scheduling links arrive in emails or LinkedIn messages. Ask:
   1. What time slot do you prefer for interviews? (e.g: "13:00 to 16:00 AR")
   2. Are there any fixed blocked days/times? (e.g: "Tuesday 14:00 to 15:00, English class")
   3. What is your timezone? (default: America/Argentina/Buenos_Aires)

   Save to `users.data.availability`:
   ```bash
   node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{availability}', '{\"preferred_hours\":\"<start>-<end> AR\",\"timezone\":\"<tz>\",\"blocked\":{\"<day>\":\"<start>-<end> (<reason>)\"}}') WHERE id = 1" --write
   ```

   The `news` flow uses this to filter available slots from scheduling links (Calendly, SmartRecruiters, etc.) without asking the user each time.
5. Open browser respecting the preference from step 4. For manual login it's always headed (Gold Rule 5). Use the wrapper (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed`
6. Ask for email. Navigate to provider login (Gmail → accounts.google.com, Outlook → outlook.live.com). Fill email with `fill`, click Next, wait for manual auth + 2FA
7. Validate session: navigate to inbox, confirm URL doesn't redirect to login
8. Ask if user has a connection string or wants to create a DB on Neon
9. If create: navigate to console.neon.tech, login with Google (reuse session), "New project", name `job-seeker`, nearest region, Create. Read connection string (Show password + eval to extract)
10. Save connection string to `.env` as `DATABASE_URL`
11. Ask for user's name
12. Create `users` table and insert record via the db CLI (`scripts/db.js`):
    ```bash
    node scripts/db.js "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, data JSONB DEFAULT '{}')" --write
    node scripts/db.js "INSERT INTO users (name, email, data) VALUES ('<name>', '<email>', '{}'::jsonb) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name" --write
    ```
13. Navigate to linkedin.com/login. Wait for manual auth + 2FA
14. Validate session: navigate to linkedin.com/feed/
15. Save LinkedIn profile URL to `users.data.linkedin_profile` via db CLI:
    ```bash
    node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{linkedin_profile}', '\"<url>\"') WHERE id = 1" --write
    ```
16. Collect user info from all logged-in sites (LinkedIn, Gmail/Google): name, photo, phone, email. Save to `users.data` as JSONB via db CLI (`jsonb_set`). Useful for aligning profiles on other job platforms
17. Check if profiles need updating (inconsistent data across sites). Report to user
18. Close browser

## Rules

- Full autonomy. Only ask for intervention to: data that can't be inferred, manual login, 2FA
- Email login first, LinkedIn second
- Validate session after each login
- `.env` not tracked
- Custom schema: only create tables when needed
- JSONB for semi-structured data in `users.data`
- Single user (repo owner)
- **Browser mode preference is set in step 4 and stored in `preferences` table.** All subsequent flows must load and respect it. Manual login/2FA is always headed regardless of preference (Gold Rule 5)

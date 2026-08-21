---
name: onboarding
description: Initial environment setup. Browser, logins, DB, user data, profile, strategy.
trigger: onboarding
---
# Onboarding

## Steps

### Phase 1: Technical setup

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

### Phase 2: Browser and logins

5. Open browser respecting the preference from step 4. For manual login it's always headed (Gold Rule 5). Use the wrapper (see AGENTS.md "Browser session"): `node scripts/browser.js open <url> --headed`
6. Ask for email. Navigate to provider login (Gmail → accounts.google.com, Outlook → outlook.live.com). Fill email with `fill`, click Next, wait for manual auth + 2FA
7. Validate session: navigate to inbox, confirm URL doesn't redirect to login

### Phase 3: Database setup

8. **Database setup. Neon is the default recommended option.** Present the options in this order:
   - **Option A (recommended): Create a free DB on Neon.** The agent navigates to console.neon.tech, logs in with Google (reuses session), creates a "New project", names it `job-seeker`, selects nearest region, and reads the connection string (Show password + eval to extract)
   - **Option B: Bring your own connection string.** If the user already has a Postgres DB (Neon, Supabase, Railway, local, etc.), they paste the connection string directly

   Neon is presented as the default because it's free, serverless, and requires zero local setup. The agent should not wait for the user to ask about Neon, it should offer it proactively.

9. Save connection string to `.env` as `DATABASE_URL`
10. Ask for user's name
11. Create `users` table and insert record via the db CLI (`scripts/db.js`):
    ```bash
    node scripts/db.js "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, data JSONB DEFAULT '{}')" --write
    node scripts/db.js "INSERT INTO users (name, email, data) VALUES ('<name>', '<email>', '{}'::jsonb) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name" --write
    ```

### Phase 4: LinkedIn

12. Navigate to linkedin.com/login. Wait for manual auth + 2FA
13. Validate session: navigate to linkedin.com/feed/
14. Save LinkedIn profile URL to `users.data.linkedin_profile` via db CLI:
    ```bash
    node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{linkedin_profile}', '\"<url>\"') WHERE id = 1" --write
    ```
15. Collect user info from all logged-in sites (LinkedIn, Gmail/Google): name, photo, phone, email. Save to `users.data` as JSONB via db CLI (`jsonb_set`). Useful for aligning profiles on other job platforms
16. Check if profiles need updating (inconsistent data across sites). Report to user
17. Close browser

### Phase 5: Profile (CV-first)

18. **Ask for CV (URL or PDF).** This is the first step of the profile flow (see `profile` skill, Step 1). The agent extracts experience, sector, profile, and infers career stage from the CV.
19. **Run the gap questionnaire** (profile skill, Step 2). The agent generates only the questions the CV doesn't answer, adapted to the inferred career stage. Management questions only if applicable. No hardcoded deal-breakers.
20. **Ask about current situation and expectations** (profile skill, Step 3). Employment status, urgency, salary, work mode, availability for interviews.

### Phase 6: Strategy

21. **Define strategy** (see `strategy` skill). Now that the agent has the full profile (CV + gaps + situation), it proposes a strategy level informed by everything above. Questions are adapted to the user's career stage:
    - If junior/mid: "Are you open to roles above your current level, or only same-level matches?"
    - If senior+ with management: "Would you accept IC roles or only Manager?"
    
    Save to DB:
    ```bash
    # Save level to preferences
    node scripts/db.js "INSERT INTO preferences (user_id, category, key, value, confidence, source) VALUES (1, 'workflow', 'strategy_level', '<level>', 1.0, 'explicit_statement') ON CONFLICT (user_id, category, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()" --write
    # Save detailed parameters to users.data.strategy
    node scripts/db.js "UPDATE users SET data = jsonb_set(data, '{strategy}', '<json>'::jsonb) WHERE id = 1" --write
    ```
    The strategy JSON should contain all parameters (see AGENTS.md "Strategy levels" for the schema per level). If the user customizes any parameter, override the default for that level.
    If no strategy is set, default to `selective`.

### Phase 7: Polish suggestion

22. **Suggest aligning CV and LinkedIn profile to the job target.** After the strategy is defined, the agent compares the user's current CV and LinkedIn profile against the defined job target and identifies gaps (missing keywords, misaligned titles, underrepresented skills, weak LinkedIn headline). Present the analysis and offer to run the `polish` skill. If the user accepts, run `polish`. If not, remind them once at the end of onboarding.

### Phase 8: Wrap up

23. **Voice and style capture** (profile skill, voice phase). Infer tone and style from LinkedIn sent messages and Gmail sent emails. Confirm with user. Save to `users.data.style_profile`.
24. **Platform assignment** (profile skill, platforms phase). Cross-reference profile vs `PLATFORMS.md`, assign tiers, save to `users.data.platforms`. Don't ask the user.
25. **Summary.** Present a summary of everything that was set up: browser mode, DB, profile, strategy, polish status, platforms. One line per item.

## Rules

- Full autonomy. Only ask for intervention to: data that can't be inferred, manual login, 2FA
- Email login first, LinkedIn second
- Validate session after each login
- `.env` not tracked
- Custom schema: only create tables when needed
- JSONB for semi-structured data in `users.data`
- Single user (repo owner)
- **Browser mode preference is set in step 4 and stored in `preferences` table.** All subsequent flows must load and respect it. Manual login/2FA is always headed regardless of preference (Gold Rule 5)
- **CV is requested before strategy.** The profile (CV analysis + gap questionnaire + situation) informs the strategy questions. Never ask strategy questions before having the CV
- **Neon is the default DB option.** Present it proactively as the recommended choice. Don't wait for the user to ask
- **Polish is suggested at the end of onboarding.** After strategy is defined, the agent proactively suggests aligning the CV and LinkedIn profile to the job target. Never skip this step
- **Questions adapt to career stage.** The agent infers career stage from the CV and adapts strategy questions accordingly. Never ask "IC or Manager?" to a junior

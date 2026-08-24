---
name: groq-signup-apikey
description: Create a Groq account and generate an API key for transcription (Whisper) or LLM inference. Use when a user needs a free Groq API key for audio transcription or chat completions.
---

# Groq — Account Signup & API Key Creation

## When to use

You need a Groq API key to use Groq's free inference API (Whisper transcription, LLM chat completions). This guide covers the full signup flow and API key creation from scratch.

## Prerequisite

- A browser session (headed recommended — a captcha may appear).
- An email address the user can receive mail at (magic-link login).

## Step 1: Navigate to Groq Console

```
https://console.groq.com
```

The landing page shows a "Create Account or Login" panel with four options:

- **Continue with Google** (OAuth)
- **Continue with GitHub** (OAuth)
- **Continue with SSO**
- **Continue with email** (magic link)

## Step 2: Sign up / Log in

### Option A: Email (magic link) — recommended for automation

1. Click the `textbox "Email"` (placeholder: `example@email.com`).
2. Type the user's email with `keyboard.type()`.
3. Click `button "Continue with email"`.
4. The page shows "Check your email" with the address confirmation.
5. Open the user's inbox, find the email from Groq titled "Your login request to Groq".
6. Extract the magic link from the "Log in" button href:

```js
() => {
  const link = Array.from(document.querySelectorAll('a')).find(a =>
    a.textContent.trim() === 'Log in' && a.href.includes('stytch.com/v1/magic_links/redirect')
  );
  return link ? link.href : 'not found';
}
```

7. Navigate to that URL in the browser. The redirect chain is:
   `stytch.com/v1/magic_links/redirect?...` → `console.groq.com/authenticate?stytch_redirect_type=login` → `console.groq.com/home`

8. Wait for the dashboard to load. Verify success by checking for the organization selector:

```js
() => {
  const btn = document.querySelector('[data-testid="organization-selector"]');
  return btn ? 'logged in' : 'not logged in';
}
```

### Option B: Google OAuth

1. Click `button "Continue with Google"`.
2. Google's account chooser appears. Select the account.
3. A consent screen appears ("Google permitirá que Groq acceda a esta información"). Click "Continuar".
4. The redirect may fail with a `400` error on `api.groq.com/platform/v1/user/profile/signupb2b`. If this happens, fall back to the email magic-link flow (Option A).

**Note:** Google OAuth signup was observed to fail with a `400` from `signupb2b` on 2026-08-21. The email magic-link flow worked reliably.

## Step 3: Navigate to API Keys

Once logged in, go to:

```
https://console.groq.com/keys
```

Or click `link "API Keys"` in the left navigation.

## Step 4: Create an API Key

1. Click `button "Create API Key"` (`data-testid="keys-page-create-button"`).
2. A dialog appears with:
   - `textbox "Display Name"` (`data-testid="key-name-input"`) — enter a descriptive name (max 50 chars).
   - `combobox "Expiration"` (`data-testid="key-expiration-select"`) — defaults to "No expiration".

3. **Captcha:** Groq may display a captcha (Turnstile) before the Submit button appears. The captcha is not in the accessibility snapshot — check for it visually. The user must solve it manually in a headed browser.

4. After the captcha is solved, `button "Submit"` (`data-testid="key-form-submit-button"`) appears in the dialog.

5. Click Submit. The response shows:
   - A message: "Your new API key has been created. Copy it now, as we will not display it again."
   - `textbox` containing the key (starts with `gsk_`).
   - `button "Copy"`.

6. Extract the key value:

```js
() => {
  const input = document.querySelector('[role="dialog"] input[readonly], [role="dialog"] input:not([placeholder])');
  return input ? input.value : 'not found';
}
```

7. Click `button "Done"` to close the dialog.

## Step 5: Store the API key

The key starts with `gsk_` followed by an alphanumeric string. Store it as an environment variable:

```bash
export GROQ_API_KEY="gsk_..."
```

Add it to a `.env` file or shell profile. **Never commit the key to a repository.**

## Verification

Test the key with a simple transcription request:

```bash
curl -s -X POST "https://api.groq.com/openai/v1/audio/transcriptions" \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F "file=@<AUDIO_FILE>" \
  -F "model=whisper-large-v3" \
  -F "language=es" \
  -F "response_format=json"
```

A valid key returns:

```json
{"text":" <transcribed text>","x_groq":{"id":"req_..."}}
```

An invalid key returns `401 Unauthorized`.

## Anti-patterns

- **Do not** use Google OAuth if it fails with `400 signupb2b` — fall back to email magic link.
- **Do not** close the dialog before copying the key — Groq only shows it once.
- **Do not** hardcode the key in scripts or documentation. Use environment variables.
- **Do not** assume the captcha won't appear — always run headed when creating keys for the first time.

## Notes

- The free tier (Developer plan) is immediately active after signup. No payment information required.
- API keys are scoped to the organization, not the individual user.
- The magic link expires in 1 hour.
- If the magic link is opened in a new tab, the original tab may not detect the session. Navigate to the magic link URL directly in the same tab.
- Available transcription models: `whisper-large-v3`, `whisper-large-v3-turbo` (faster, similar accuracy).

**Validated:** 2026-08-21 against live `console.groq.com` with email magic-link flow and `whisper-large-v3-turbo` transcription.

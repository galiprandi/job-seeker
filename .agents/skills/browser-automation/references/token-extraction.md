# Token Extraction from Browser localStorage

Many web apps store auth tokens (JWT, OAuth, Cognito) in `localStorage`. You can extract them at runtime to call the app's internal API directly, bypassing the UI. This is faster and more reliable than UI automation for messaging, data retrieval, and status changes.

**Generic pattern:**

```bash
# 1. Navigate to the app (ensures localStorage is populated)
node scripts/browser.js goto "https://app.example.com"

# 2. Extract token by searching localStorage keys
node scripts/browser.js exec eval "(function(){
  const keys = Object.keys(localStorage);
  // Look for keys containing the app's domain or 'token'/'access'
  const k = keys.find(k => k.includes('example.com') && k.includes('token'));
  if (!k) return JSON.stringify({error: 'no token found'});
  const v = JSON.parse(localStorage.getItem(k));
  return JSON.stringify({token: v.secret || v.accessToken || v.access_token});
})()"

# 3. Parse JWT payload (if token is a JWT) for user info
node scripts/browser.js exec eval "(function(){
  const token = '<extracted_token>';
  const payload = JSON.parse(atob(token.split('.')[1]));
  return JSON.stringify({oid: payload.oid, name: payload.name, email: payload.email});
})()"
```

**Base64 extraction trick (avoids JSON escaping issues):**

When localStorage values contain complex JSON with nested quotes, extract via base64:

```bash
node scripts/browser.js exec eval "btoa(JSON.stringify(Object.fromEntries(Object.entries(localStorage))))"
# Then decode locally: echo '<base64>' | base64 -d | jq
```

**Apps known to use localStorage tokens:**
- **Teams:** `ic3.teams.office.com` + `accesstoken` key (fallback: `chatsvcagg.teams.microsoft.com`)
- **Cognito-based apps:** `access_token`, `refresh_token`, `token_type` keys
- **Custom portals:** `@user`, `authToken`, or app-prefixed keys

**Token refresh pattern (Cognito/AWS):**

If a token has a `refresh_token`, use it to get a fresh access token without re-opening the browser:

```bash
curl -X POST "https://cognito-idp.<region>.amazonaws.com/" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d '{"AuthFlow":"REFRESH_TOKEN_AUTH","ClientId":"<client_id>","AuthParameters":{"REFRESH_TOKEN":"<refresh_token>"}}'
```

**Gotchas:**
- Tokens expire (typically 1 hour). Re-extract if you get 401.
- The token from one subdomain may not work for another API endpoint. Try alternative keys.
- JWT `oid` may differ between token sources. Use the one that matches the API you're calling.

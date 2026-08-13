# API Request Capture (Reverse Engineering)

When an app's internal API is undocumented, capture network requests to discover endpoints:

```javascript
// capture-requests.js — intercept POST/PUT requests
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext('.browser-profile', {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  page.on('request', (req) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method()) &&
        (req.url().includes('api') || req.url().includes('message') || req.url().includes('chat'))) {
      console.log('URL:', req.url());
      console.log('Method:', req.method());
      console.log('Headers:', JSON.stringify(req.headers(), null, 2));
      console.log('Body:', req.postData());
    }
  });
  await page.goto('https://app.example.com', { waitUntil: 'networkidle' });
  console.log('App loaded. Perform the action you want to capture in the UI...');
  process.stdin.resume();
  process.stdin.on('data', async () => {
    await browser.close();
    process.exit(0);
  });
})();
```

This pattern works for any web app. Use it when:
- The app has no public API documentation
- You need to automate an action not covered by existing scripts
- The API has changed and existing scripts break

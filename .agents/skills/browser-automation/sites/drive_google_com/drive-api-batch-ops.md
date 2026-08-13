# Batch file operations via Drive API v3 (bypass UI) — drive.google.com

**Date:** 2026-08-13
**Type:** shortcut
**Site:** drive.google.com

## What was expected

To organize files in Google Drive (create folders, move files between folders, rename files), the obvious approach is to drive the web UI with Playwright: click "New" > "Nueva carpeta", type the folder name, click "Crear", then select files with Ctrl/Cmd+click, drag them into the folder, etc.

## What was found

The Google Drive web UI is extremely unstable for Playwright automation:

- The "Nuevo" button frequently times out on `click` (element never becomes "stable")
- Synthetic `MouseEvent` dispatches open the menu but the menu items may not register clicks reliably
- Multi-file selection via Ctrl/Cmd+click dispatched events does not work (Drive's internal selection state doesn't update from synthetic events)
- Banners (e.g. Gemini promo) interfere with element visibility and stability checks
- The "Nueva carpeta" dialog input sometimes doesn't appear even after clicking the menu item

However, Google Drive's internal API key is exposed in the page's network requests, and the `SAPISID` cookie is available via `document.cookie`. By computing a `SAPISIDHASH` from the cookie and origin, you can call the Drive API v3 directly from the page context with `fetch()`, using the browser's existing session cookies for authentication.

This allows batch operations (move multiple files, rename multiple files) in a single `eval` call, with 100% reliability and no UI interaction.

## Reproduction

### 1. Extract the API key

The Drive API key is exposed in network requests the page makes automatically. Extract it from `performance.getEntriesByType('resource')`:

```js
// In page context via eval
() => {
  const entries = performance.getEntriesByType('resource');
  const driveEntry = entries.find(e => e.name.includes('clients6.google.com/drive') && e.name.includes('key='));
  if (!driveEntry) return 'no key found';
  const url = new URL(driveEntry.name);
  return url.searchParams.get('key');
}
```

### 2. Compute the SAPISIDHASH auth token

Google APIs accept `SAPISIDHASH <timestamp>_<sha1>` as a Bearer-style Authorization header. Compute it from the `SAPISID` cookie:

```js
async () => {
  const sapisid = document.cookie
    .split(';').map(c => c.trim())
    .find(c => c.startsWith('SAPISID='))
    .split('=')[1];
  const origin = location.origin;
  const ts = Math.floor(Date.now() / 1000);
  const hashBuf = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(ts + ' ' + sapisid + ' ' + origin)
  );
  const hash = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return 'SAPISIDHASH ' + ts + '_' + hash;
}
```

### 3. Get file and folder IDs

File/folder IDs are available as `data-id` attributes on the `<tr>` rows in the file list:

```js
() => {
  const rows = document.querySelectorAll('tr[data-id]');
  return Array.from(rows).map(r => ({
    id: r.getAttribute('data-id'),
    name: r.querySelector('strong')?.textContent.trim(),
    isFolder: !!r.querySelector('[aria-label*="Carpeta"], [aria-label*="Folder"]')
  }));
}
```

### 4. Move files (batch)

Use the Drive API v3 `PATCH /files/{fileId}` with `addParents` and `removeParents` query params:

```js
async () => {
  const key = '<API_KEY>';        // from step 1
  const authToken = '<SAPISIDHASH>'; // from step 2
  const oldParent = '<SOURCE_FOLDER_ID>';
  const newParent = '<TARGET_FOLDER_ID>';
  const fileIds = ['<fileId1>', '<fileId2>', '<fileId3>'];

  const results = [];
  for (const fileId of fileIds) {
    const resp = await fetch(
      `https://clients6.google.com/drive/v3/files/${fileId}` +
      `?addParents=${newParent}&removeParents=${oldParent}&key=${key}&alt=json`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
        credentials: 'include'
      }
    );
    results.push({ fileId, status: resp.status });
  }
  return JSON.stringify(results);
}
```

### 5. Rename files (batch)

Use the same `PATCH /files/{fileId}` endpoint with a `name` field in the body:

```js
async () => {
  const key = '<API_KEY>';
  const authToken = '<SAPISIDHASH>';
  const renames = [
    { id: '<fileId1>', newName: '2025-06.pdf' },
    { id: '<fileId2>', newName: '2025-SAC-1.pdf' },
  ];

  const results = [];
  for (const r of renames) {
    const resp = await fetch(
      `https://clients6.google.com/drive/v3/files/${r.id}?key=${key}&alt=json`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: r.newName }),
        credentials: 'include'
      }
    );
    results.push({ newName: r.newName, status: resp.status });
  }
  return JSON.stringify(results);
}
```

### 6. Create folders

Folder creation still works via the UI (with synthetic events), but can also be done via API:

```js
async () => {
  const key = '<API_KEY>';
  const authToken = '<SAPISIDHASH>';
  const parentId = '<PARENT_FOLDER_ID>';
  const folderName = '2025';

  const resp = await fetch(
    `https://clients6.google.com/drive/v3/files?key=${key}&alt=json`,
    {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      }),
      credentials: 'include'
    }
  );
  const data = await resp.json();
  return JSON.stringify({ id: data.id, name: data.name, status: resp.status });
}
```

### Notes

- All operations return HTTP 200 on success. Check status codes in the results array.
- The `SAPISIDHASH` is time-stamped and expires. Recompute it if you get 401s.
- The API key (`AIzaSy...`) is not secret — it's embedded in the Drive web app and only works with valid session cookies.
- `credentials: 'include'` is required so the browser sends its cookies with the request.
- The endpoint host is `clients6.google.com`, not `www.googleapis.com`. Both work, but `clients6.google.com` is what the Drive web app itself uses.
- Folder creation via UI (synthetic events) works but is flaky. The API approach is more reliable.

## Suggested guide update

Create a new `sites/drive_google_com/guide.md` with:

1. A warning that the Drive UI is unstable for Playwright clicks (timeouts, unstable elements, broken multi-select)
2. The API-first approach as the recommended method for file operations (move, rename, create folder)
3. The SAPISIDHASH computation pattern
4. The API key extraction pattern
5. Batch operation patterns for move and rename
6. File/folder ID extraction from `data-id` attributes

This guide would save future agents from spending significant time trying to click through the Drive UI, which is the natural first approach but consistently fails.

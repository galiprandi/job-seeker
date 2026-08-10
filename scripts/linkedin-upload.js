/**
 * LinkedIn Upload Attachment — registers upload and gets upload URL.
 *
 * Step 1: POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload
 * Step 2: PUT binary to the returned singleUploadUrl
 * Step 3: Poll pollingUrl until status is AVAILABLE
 *
 * NOTE: Upload works, but sending a message WITH the attachment via HTTP endpoint
 * does NOT work (UI uses WebSocket). For attachments, use the UI flow.
 *
 * Usage: node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-upload.js)"
 *
 * Before running: set FILE_SIZE and FILE_NAME below.
 */

(function () {
  var csrf = document.cookie
    .split('; ')
    .find(function (c) { return c.indexOf('JSESSIONID=') === 0; });
  csrf = csrf ? csrf.split('=')[1].replace(/"/g, '') : '';

  // === CONFIGURE THESE ===
  var FILE_SIZE = 0; // bytes — must match actual file size
  var FILE_NAME = '<filename>';
  // === END CONFIG ===

  var body = {
    mediaUploadType: 'MESSAGING_FILE_ATTACHMENT',
    fileSize: FILE_SIZE,
    filename: FILE_NAME,
  };

  return fetch(
    '/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload',
    {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
    .then(function (r) { return r.text(); })
    .then(function (t) { return t.substring(0, 2000); });
})()

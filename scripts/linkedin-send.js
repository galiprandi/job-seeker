/**
 * LinkedIn Send Message — unified script for sending messages with optional attachments.
 *
 * Supports:
 *   - New conversation (first message to a connection)
 *   - Reply to existing conversation
 *   - Text only
 *   - Text + file attachment (PDF, etc.)
 *
 * Endpoints:
 *   New conversation:  POST /voyager/api/messaging/conversations?action=create
 *   Reply:             POST /voyager/api/messaging/conversations/{chatId}/events?action=create
 *   With attachment:   POST /voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage
 *   Upload register:   POST /voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload
 *   Upload binary:     PUT {singleUploadUrl}
 *
 * Usage:
 *   node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-send.js)"
 *
 * Before running: set MODE, RECIPIENT_ID or THREAD_ID, MESSAGE_TEXT, and FILE_B64 (if attachment).
 *
 * For attachments, the file must be base64-encoded because page.evaluate() only accepts strings.
 * Encode with: base64 -i <file> | tr -d '\n'
 */

(function () {
  var csrf = document.cookie
    .split('; ')
    .find(function (c) { return c.indexOf('JSESSIONID=') === 0; });
  csrf = csrf ? csrf.split('=')[1].replace(/"/g, '') : '';

  // === CONFIGURE THESE ===
  var MODE = 'reply'; // 'new' | 'reply'
  var RECIPIENT_ID = 'REPLACE_WITH_RECIPIENT_FSD_ID'; // for MODE='new'
  var THREAD_ID = 'REPLACE_WITH_THREAD_ID'; // for MODE='reply' (format: 2-XXXXX==)
  var MESSAGE_TEXT = 'REPLACE_WITH_MESSAGE';
  var FILE_B64 = ''; // base64-encoded file content, empty string = no attachment
  var FILE_NAME = 'document.pdf';
  var FILE_MIME = 'application/pdf';
  // === END CONFIG ===

  var SELF_ID = (document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) || [])
    .sort(function (a, b) {
      return document.documentElement.outerHTML.split(a).length - document.documentElement.outerHTML.split(b).length;
    }).pop();

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function randomTrackingId() {
    var t = '';
    for (var i = 0; i < 16; i++) t += String.fromCharCode(Math.floor(Math.random() * 256));
    return t;
  }

  function b64ToBlob(b64, mime) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  var hasAttachment = FILE_B64.length > 0;

  // --- Text-only: new conversation (legacy endpoint) ---
  if (MODE === 'new' && !hasAttachment) {
    var body = {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: {
        eventCreate: {
          value: {
            'com.linkedin.voyager.messaging.create.MessageCreate': {
              attributedBody: { text: MESSAGE_TEXT, attributes: [] },
              attachments: [],
            },
          },
        },
        recipients: [RECIPIENT_ID],
        subtype: 'MEMBER_TO_MEMBER',
      },
    };

    return fetch('/voyager/api/messaging/conversations?action=create', {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.text(); })
      .then(function (t) { return t.substring(0, 1500); });
  }

  // --- Text-only: reply (legacy endpoint) ---
  if (MODE === 'reply' && !hasAttachment) {
    var replyBody = {
      eventCreate: {
        value: {
          'com.linkedin.voyager.messaging.create.MessageCreate': {
            attributedBody: { text: MESSAGE_TEXT, attributes: [] },
            attachments: [],
          },
        },
      },
    };

    return fetch('/voyager/api/messaging/conversations/' + encodeURIComponent(THREAD_ID) + '/events?action=create', {
      method: 'POST',
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'application/json',
      },
      body: JSON.stringify(replyBody),
    })
      .then(function (r) { return r.text(); })
      .then(function (t) { return t.substring(0, 1500); });
  }

  // --- With attachment: use dash endpoint (works for both new and reply) ---
  // For new conversations, first create the conversation via legacy endpoint, then send with attachment.
  // For replies, use the existing THREAD_ID directly.

  function sendWithAttachment(fileBlob, fileSize, mediaUrn) {
    var blobUrl = URL.createObjectURL(fileBlob);
    var convUrn = 'urn:li:msg_conversation:(urn:li:fsd_profile:' + SELF_ID + ',' + THREAD_ID + ')';

    var dashBody = JSON.stringify({
      message: {
        body: { attributes: [], text: MESSAGE_TEXT },
        renderContentUnions: [
          {
            file: {
              assetUrn: mediaUrn,
              byteSize: fileSize,
              mediaType: FILE_MIME,
              name: FILE_NAME,
              url: blobUrl,
            },
          },
        ],
        conversationUrn: convUrn,
        originToken: uuid(),
      },
      mailboxUrn: 'urn:li:fsd_profile:' + SELF_ID,
      trackingId: randomTrackingId(),
      dedupeByClientGeneratedToken: false,
    });

    return fetch('/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
        'content-type': 'text/plain;charset=UTF-8',
      },
      body: dashBody,
    })
      .then(function (r) { return r.text(); })
      .then(function (t) { return t.substring(0, 1500); });
  }

  var fileBlob = b64ToBlob(FILE_B64, FILE_MIME);
  var fileSize = fileBlob.size;

  // Step 1: Register upload
  var registerBody = JSON.stringify({
    mediaUploadType: 'MESSAGING_FILE_ATTACHMENT',
    fileSize: fileSize,
    filename: FILE_NAME,
  });

  return fetch('/voyager/api/voyagerVideoDashMediaUploadMetadata?action=upload', {
    method: 'POST',
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0',
      'x-li-lang': 'en_US',
      'csrf-token': csrf,
      'content-type': 'application/json',
    },
    body: registerBody,
  })
    .then(function (r) { return r.json(); })
    .then(function (regData) {
      var uploadUrl = regData.data.value.singleUploadUrl;
      var mediaUrn = regData.data.value.urn;

      // Step 2: Upload binary
      return fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': FILE_MIME },
        body: fileBlob,
      }).then(function () { return mediaUrn; });
    })
    .then(function (mediaUrn) {
      // Step 3: Wait for processing
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(mediaUrn); }, 2000);
      });
    })
    .then(function (mediaUrn) {
      // Step 4: Send message with attachment
      return sendWithAttachment(fileBlob, fileSize, mediaUrn);
    });
})()

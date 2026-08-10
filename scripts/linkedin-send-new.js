/**
 * LinkedIn Send New Message — creates a new conversation with a recipient.
 *
 * Endpoint: POST /voyager/api/messaging/conversations?action=create
 *
 * Usage: node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-send-new.js)"
 *
 * Before running: set RECIPIENT_ID and MESSAGE_TEXT below.
 */

(function () {
  var csrf = document.cookie
    .split('; ')
    .find(function (c) { return c.indexOf('JSESSIONID=') === 0; });
  csrf = csrf ? csrf.split('=')[1].replace(/"/g, '') : '';

  // === CONFIGURE THESE ===
  var RECIPIENT_ID = 'REPLACE_WITH_RECIPIENT_FSD_ID';
  var MESSAGE_TEXT = 'REPLACE_WITH_MESSAGE';
  // === END CONFIG ===

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

  return fetch(
    '/voyager/api/messaging/conversations?action=create',
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
    .then(function (t) { return t.substring(0, 1500); });
})()

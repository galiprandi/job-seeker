/**
 * LinkedIn Inbox Fetcher — uses Voyager GraphQL API from inside the browser session.
 *
 * Endpoint: /voyager/api/voyagerMessagingGraphQL/graphql
 * Query ID: messengerConversations.0d5e6781bbee71c3e51c8843c6519f48
 *
 * Usage: node scripts/browser.js exec eval --tab linkedin "$(cat scripts/linkedin-inbox.js)"
 *
 * Returns: JSON array of conversations with participants, unread count, last message, last activity.
 */

(function () {
  var csrf = document.cookie
    .split('; ')
    .find(function (c) { return c.indexOf('JSESSIONID=') === 0 });
  csrf = csrf ? csrf.split('=')[1].replace(/"/g, '') : '';

  // Self fsd_profile_id — extract from profile page HTML at runtime
  // document.documentElement.outerHTML.match(/ACoAA[A-Za-z0-9_-]{5,}/g) (most frequent match)
  var selfId = '<YOUR_FSD_PROFILE_ID>';
  var mailbox = 'urn%3Ali%3Afsd_profile%3A' + selfId;
  var vars = '(mailboxUrn:' + mailbox + ')';

  return fetch(
    '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.0d5e6781bbee71c3e51c8843c6519f48&variables=' + vars,
    {
      headers: {
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
        'x-li-lang': 'en_US',
        'csrf-token': csrf,
      },
    }
  )
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var inc = d.included || [];
      var TYPE_KEY = '$type';

      // Build lookup maps
      var participants = {};
      var messages = {};
      var conversations = {};

      inc.forEach(function (x) {
        var t = x[TYPE_KEY] || '';
        if (t === 'com.linkedin.messenger.MessagingParticipant') {
          participants[x.entityUrn] = x;
        } else if (t === 'com.linkedin.messenger.Message') {
          messages[x.entityUrn] = x;
        } else if (t === 'com.linkedin.messenger.Conversation') {
          conversations[x.entityUrn] = x;
        }
      });

      // Get conversation order from root
      var rootObj = d.data && d.data.data ? d.data.data : {};
      var rootKey = Object.keys(rootObj).find(function (k) { return k.indexOf('messengerConversations') === 0; });
      var root = rootKey ? rootObj[rootKey] : null;
      var convOrder = root ? root['*elements'] || [] : [];

      // Normalize participants
      function normPart(p) {
        var member = p && p.participantType && p.participantType.member ? p.participantType.member : {};
        var hostId = p ? p.hostIdentityUrn || '' : '';
        var fsdId = hostId.replace('urn:li:fsd_profile:', '');
        return {
          name: ((member.firstName && member.firstName.text ? member.firstName.text : '') + ' ' + (member.lastName && member.lastName.text ? member.lastName.text : '')).trim(),
          headline: member.headline && member.headline.text ? member.headline.text : '',
          fsdId: fsdId,
          isSelf: fsdId === selfId,
        };
      }

      // Build result
      var result = [];
      convOrder.forEach(function (convUrn) {
        var conv = conversations[convUrn];
        if (!conv) return;

        var partUrns = conv['*conversationParticipants'] || [];
        var parts = partUrns
          .map(function (urn) { return participants[urn]; })
          .filter(Boolean)
          .map(normPart)
          .filter(function (p) { return !p.isSelf; });

        // Find last message
        var lastMsg = null;
        var bestDelivered = 0;
        Object.keys(messages).forEach(function (urn) {
          var msg = messages[urn];
          if (msg['*conversation'] !== convUrn) return;
          var delivered = msg.deliveredAt || 0;
          if (delivered > bestDelivered) {
            bestDelivered = delivered;
            var senderUrn = msg['*sender'] || '';
            var senderFsd = senderUrn.split('urn:li:fsd_profile:').pop() || '';
            lastMsg = {
              text: (msg.body && msg.body.text ? msg.body.text : '').substring(0, 120),
              deliveredAt: delivered,
              isFromSelf: senderFsd === selfId,
            };
          }
        });

        result.push({
          participants: parts.map(function (p) { return p.name; }).join(', '),
          unreadCount: conv.unreadCount || 0,
          lastActivityAt: conv.lastActivityAt || 0,
          lastMessage: lastMsg,
          threadId: convUrn,
        });
      });

      return JSON.stringify(result, null, 2);
    });
})()

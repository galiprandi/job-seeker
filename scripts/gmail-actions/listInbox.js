#!/usr/bin/env node
/**
 * listInbox.js — Extract the visible Gmail inbox conversation list.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Navigates to the inbox and returns the senders,
 * subjects, and snippets that are currently rendered.
 *
 * Usage:
 *   const { listInbox } = require('./scripts/gmail-actions/listInbox');
 *   const conversations = listInbox({ session: 'default' });
 */
'use strict';

const { goto, evalJSON, waitFor } = require('../../lib/browser-helpers');

const INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {{ timeout?: number }?} options
 * @returns {Array<{ sender: string, subject: string, snippet: string, link: string }>}
 */
function listInbox(opts, options = {}) {
  const timeout = options.timeout ?? 20000;

  goto(INBOX_URL, opts);

  // Give the AJAX conversation list a moment to render.
  waitFor(`document.querySelectorAll('tr[role="row"], tr[data-thread-id]').length > 0`, { ...opts, timeout: Math.min(timeout, 8000) });

  const conversations = evalJSON(`(function(){
    var results = [];
    var rows = document.querySelectorAll(
      'tr[role="row"], tr[data-thread-id], tr[draggable="true"]'
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.children.length < 3) continue;
      var senderEl =
        row.querySelector('span[email]') ||
        row.querySelector('span[name]') ||
        row.querySelector('td:nth-child(2) span, td:nth-child(3) span');
      var subjectEl =
        row.querySelector('[data-legacy-last-message-subject]') ||
        row.querySelector('.y6 > span, .y6 span') ||
        row.querySelector('td:nth-child(4) span[title], td:nth-child(5) span[title]');
      var snippetEl =
        row.querySelector('.y2') ||
        row.querySelector('span[title]:nth-of-type(2)') ||
        row.querySelector('td:nth-child(6) span, td:nth-child(5) span');
      var linkEl = row.querySelector('a[href*="#inbox/"]') || row.querySelector('a');

      var sender = senderEl ? (senderEl.getAttribute('email') || senderEl.textContent).trim() : '';
      var subject = subjectEl ? subjectEl.textContent.trim() : '';
      var snippet = snippetEl ? snippetEl.textContent.replace(/^\\s*-\\s*/, '').trim() : '';
      var link = linkEl && linkEl.href ? linkEl.href : '';

      if (sender || subject || snippet) {
        results.push({ sender: sender, subject: subject, snippet: snippet, link: link });
      }
    }
    return results;
  })()`, opts);

  return conversations || [];
}

module.exports = { listInbox };

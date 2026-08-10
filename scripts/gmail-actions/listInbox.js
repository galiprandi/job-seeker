#!/usr/bin/env node
/**
 * listInbox.js — Extract the visible Gmail inbox conversation list.
 *
 * Expects a Playwright Page object on an authenticated Gmail session opened
 * via the browser wrapper. Navigates to the inbox and returns the senders,
 * subjects, and snippets that are currently rendered.
 *
 * Usage:
 *   const { listInbox } = require('./scripts/gmail-actions/listInbox');
 *   const conversations = await listInbox(page);
 */
'use strict';

const INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';

/**
 * @param {import('playwright-core').Page} page
 * @param {{ timeout?: number }?} options
 * @returns {Promise<Array<{ sender: string, subject: string, snippet: string, link: string }>>}
 */
async function listInbox(page, options = {}) {
  const timeout = options.timeout ?? 20000;

  await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded', timeout });

  // Give the AJAX conversation list a moment to render.
  await page.waitForTimeout(2000);

  const conversations = await page.evaluate(() => {
    const results = [];

    const rows = document.querySelectorAll(
      'tr[role="row"], tr[data-thread-id], tr[draggable="true"]'
    );

    for (const row of rows) {
      // Skip section or label rows.
      if (row.children.length < 3) continue;

      const senderEl =
        row.querySelector('span[email]') ||
        row.querySelector('span[name]') ||
        row.querySelector('td:nth-child(2) span, td:nth-child(3) span');

      const subjectEl =
        row.querySelector('[data-legacy-last-message-subject]') ||
        row.querySelector('.y6 > span, .y6 span') ||
        row.querySelector('td:nth-child(4) span[title], td:nth-child(5) span[title]');

      const snippetEl =
        row.querySelector('.y2') ||
        row.querySelector('span[title]:nth-of-type(2)') ||
        row.querySelector('td:nth-child(6) span, td:nth-child(5) span');

      const linkEl = row.querySelector('a[href*="#inbox/"]') || row.querySelector('a');

      const sender = senderEl ? (senderEl.getAttribute('email') || senderEl.textContent).trim() : '';
      const subject = subjectEl ? subjectEl.textContent.trim() : '';
      const snippet = snippetEl ? snippetEl.textContent.replace(/^\s*-\s*/, '').trim() : '';
      const link = linkEl && linkEl.href ? linkEl.href : '';

      if (sender || subject || snippet) {
        results.push({ sender, subject, snippet, link });
      }
    }

    return results;
  });

  return conversations;
}

module.exports = { listInbox };

#!/usr/bin/env node
/**
 * openConversation.js — Open a LinkedIn conversation by name.
 *
 * Expects a Playwright Page object already on the LinkedIn messaging page
 * (or it navigates there). Searches the conversation list, clicks the match,
 * and waits for the thread to load.
 *
 * Usage:
 *   const { openConversation } = require('./scripts/linkedin/openConversation');
 *   await openConversation(page, 'Jane Doe');
 */
'use strict';

const { waitForText } = require('../lib/playwright-helpers');

const MESSAGING_URL = 'https://www.linkedin.com/messaging/';
const LIST_ITEM_SELECTOR = 'div.msg-conversation-listitem__link';
const THREAD_URL_RE = /\/messaging\/thread\//;

/**
 * @param {import('playwright-core').Page} page
 * @param {string} personName
 * @param {{ timeout?: number }?} options
 */
async function openConversation(page, personName, options = {}) {
  const timeout = options.timeout ?? 15000;

  // Ensure we are on the messaging list view.
  if (!page.url().includes('/messaging')) {
    await page.goto(MESSAGING_URL, { waitUntil: 'domcontentloaded', timeout });
  }

  // Wait for the conversation list to render.
  await page.locator(LIST_ITEM_SELECTOR).first().waitFor({ timeout });

  // Find the list item with the requested name.
  const match = page.locator(LIST_ITEM_SELECTOR).filter({ hasText: personName }).first();

  try {
    await match.click({ timeout });
  } catch (err) {
    // Fallback: try an exact text match via getByText if the list item label is
    // inside another element.
    await page.getByText(personName, { exact: false }).first().click({ timeout });
  }

  // Wait for the thread view and message list.
  await page.waitForURL(THREAD_URL_RE, { timeout });
  await page.locator('ul.msg-s-message-list, .msg-s-message-list').first().waitFor({ timeout });
  await waitForText(page, personName, { timeout });

  return { ok: true, url: page.url() };
}

module.exports = { openConversation };

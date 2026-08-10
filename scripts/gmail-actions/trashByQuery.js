#!/usr/bin/env node
/**
 * trashByQuery.js — Move all Gmail messages matching a search to trash.
 *
 * Expects a Playwright Page object on an authenticated Gmail session opened
 * via the browser wrapper. Navigates to the search result, selects all visible
 * conversations (and all conversations in the search if prompted), then clicks
 * the delete button while dispatching the full mouse event sequence.
 *
 * Usage:
 *   const { trashByQuery } = require('./scripts/gmail-actions/trashByQuery');
 *   await trashByQuery(page, 'from:recruiter@example.com');
 */
'use strict';

const { clickWithEvents, waitForText } = require('../lib/playwright-helpers');

const GMAIL_SEARCH_BASE = 'https://mail.google.com/mail/u/0/#search/';
const DELETE_BUTTON_SELECTOR = 'div[aria-label="Eliminar"].nX';

/**
 * @param {import('playwright-core').Page} page
 * @param {string} query
 * @param {{ timeout?: number }?} options
 */
async function trashByQuery(page, query, options = {}) {
  const timeout = options.timeout ?? 30000;

  const url = `${GMAIL_SEARCH_BASE}${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

  // Wait for the conversation list or the empty-search message.
  await page.waitForTimeout(1500);

  const hasMessages = await page
    .locator('table[role="grid"] tr, .Cp table tr, [role="listitem"]')
    .first()
    .isVisible()
    .catch(() => false);

  if (!hasMessages) {
    return { ok: true, moved: 0, query, note: 'no visible messages' };
  }

  // Click the main select-all checkbox.
  const selectAll = page
    .locator('div[role="checkbox"][aria-label*="Select"], div[role="checkbox"][aria-label*="select"]')
    .first();
  await selectAll.click({ timeout });

  // If Gmail offers to select every conversation in the search, accept it.
  const selectAllBanner = page.getByText(/Select all \d+ conversations? in/).first();
  const hasBanner = await selectAllBanner.isVisible().catch(() => false);
  if (hasBanner) {
    await selectAllBanner.click({ timeout });
    await page.waitForTimeout(500);
  }

  // Click the delete button using mousedown/click/mouseup.
  const deleteButton = page.locator(DELETE_BUTTON_SELECTOR).first();
  await deleteButton.waitFor({ state: 'visible', timeout });
  await clickWithEvents(deleteButton);

  // Wait for the trash confirmation.
  const moved = await waitForText(page, /conversation moved to trash|moved to trash|elimin/i, { timeout })
    .then(() => true)
    .catch(() => false);

  return { ok: moved, query, url: page.url() };
}

module.exports = { trashByQuery };

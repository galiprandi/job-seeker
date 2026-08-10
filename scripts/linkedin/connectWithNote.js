#!/usr/bin/env node
/**
 * connectWithNote.js — Send a LinkedIn connection request with an optional note.
 *
 * Expects a Playwright Page object already on a LinkedIn session opened via
 * the browser wrapper. Navigates to the profile, opens the connect dialog, adds
 * a note if one is provided, and sends the invitation.
 *
 * Usage:
 *   const { connectWithNote } = require('./scripts/linkedin/connectWithNote');
 *   await connectWithNote(page, 'https://www.linkedin.com/in/vanity', 'Hi!');
 */
'use strict';

const { waitForText, handleDialog } = require('../lib/playwright-helpers');

const CONNECT_SELECTORS = [
  'button[aria-label^="Connect"][type="button"]',
  'button:has-text("Connect")',
  '[data-control-name="connect"]',
  'button.pv-s-profile-actions__button',
];

const NOTE_FIELD_SELECTORS = [
  'textarea[name="message"]',
  'textarea#custom-message',
  'textarea.connect-form__message',
  'textarea[aria-label*="note"]',
];

const SEND_SELECTORS = [
  'button[aria-label="Send now"][type="button"]',
  'button:has-text("Send")',
  'button.ml1[type="submit"]',
];

/**
 * @param {import('playwright-core').Page} page
 * @param {string} profileUrl
 * @param {string} [note]
 * @param {{ timeout?: number }?} options
 */
async function connectWithNote(page, profileUrl, note, options = {}) {
  const timeout = options.timeout ?? 20000;

  // Be ready for any confirmation/leave modals.
  handleDialog(page);

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout });

  // Primary connect button.
  const connectButton = page.locator(CONNECT_SELECTORS.join(', ')).first();
  await connectButton.waitFor({ state: 'visible', timeout });
  await connectButton.click({ timeout });

  // Wait for the invitation modal.
  await page.locator('div[role="dialog"]').first().waitFor({ timeout });

  if (note && note.trim()) {
    // Open the note form if available.
    const addNote = page.getByText('Add a note', { exact: false }).first();
    const hasAddNote = await addNote.isVisible().catch(() => false);
    if (hasAddNote) {
      await addNote.click({ timeout });
    }

    const noteField = page.locator(NOTE_FIELD_SELECTORS.join(', ')).first();
    await noteField.waitFor({ state: 'visible', timeout });
    await noteField.fill(note);
  }

  const sendButton = page.locator(SEND_SELECTORS.join(', ')).first();
  await sendButton.waitFor({ state: 'visible', timeout });
  await sendButton.click({ timeout });

  // Confirm the request was sent or the profile already shows a pending state.
  let confirmed = false;
  try {
    await waitForText(page, /invitation was sent|invite sent|pending/i, { timeout: 5000 });
    confirmed = true;
  } catch {
    confirmed = await page
      .locator('span:has-text("Pending"), .artdeco-modal__dismiss')
      .first()
      .isVisible()
      .catch(() => false);
  }

  return { ok: confirmed, profileUrl, note: note || null };
}

module.exports = { connectWithNote };

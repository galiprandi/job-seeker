#!/usr/bin/env node
/**
 * sendMessage.js — Send a LinkedIn message to a connection by name.
 *
 * Expects a Playwright Page object already on a LinkedIn session opened via
 * the browser wrapper. Opens the conversation, fills the contenteditable
 * composer, triggers the input event that enables the send button, clicks send,
 * and verifies the message is in the thread.
 *
 * Usage:
 *   const { sendMessage } = require('./scripts/linkedin/sendMessage');
 *   await sendMessage(page, 'Jane Doe', 'Hello!');
 */
'use strict';

const { openConversation } = require('./openConversation');
const { fillContenteditable, waitForText } = require('../lib/playwright-helpers');

const COMPOSER_SELECTOR = 'div.msg-form__contenteditable';
const SEND_BUTTON_SELECTOR = 'button[type="submit"].msg-form__send-button';
const MESSAGE_LIST_SELECTOR = 'ul.msg-s-message-list, .msg-s-message-list';

/**
 * @param {import('playwright-core').Page} page
 * @param {string} personName
 * @param {string} message
 * @param {{ timeout?: number }?} options
 */
async function sendMessage(page, personName, message, options = {}) {
  const timeout = options.timeout ?? 20000;

  await openConversation(page, personName, { timeout });

  const composer = page.locator(COMPOSER_SELECTOR).first();
  await composer.waitFor({ state: 'visible', timeout });

  // LinkedIn's composer is a contenteditable; set text and trigger input so
  // the send button becomes enabled.
  await fillContenteditable(composer, message);

  // Small pause to let the framework react to the input event.
  await page.waitForTimeout(300);

  const sendButton = page.locator(SEND_BUTTON_SELECTOR).first();
  await sendButton.waitFor({ state: 'visible', timeout });
  await sendButton.click({ timeout });

  // Wait for the message to appear in the thread.
  const snippet = message.slice(0, 60);
  await waitForText(page, snippet, { timeout });

  // Ensure the message is inside the message list container.
  const list = page.locator(MESSAGE_LIST_SELECTOR).first();
  const sent = await list.locator(`text="${snippet}"`).first().isVisible().catch(() => false);

  return { ok: sent, message, to: personName, url: page.url() };
}

module.exports = { sendMessage };

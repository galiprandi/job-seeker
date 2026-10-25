#!/usr/bin/env node
/**
 * sendMessage.js — Send a LinkedIn message to a connection by name.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Opens the conversation, fills the contenteditable
 * composer, triggers the input event that enables the send button, clicks send,
 * and verifies the message is in the thread.
 *
 * Usage:
 *   const { sendMessage } = require('./scripts/linkedin/sendMessage');
 *   sendMessage({ session: 'default' }, '<Recipient Name>', 'Hello!');
 */
'use strict';

const { openConversation } = require('./openConversation');
const { evalJS } = require('../../lib/browser-helpers');
const { fillContenteditable, waitForText } = require('../lib/dom-helpers');

const COMPOSER_SELECTOR = 'div.msg-form__contenteditable';
const SEND_BUTTON_SELECTOR = 'button[type="submit"].msg-form__send-button';
const MESSAGE_LIST_SELECTOR = 'ul.msg-s-message-list, .msg-s-message-list';

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {string} personName
 * @param {string} message
 * @param {{ timeout?: number }?} options
 */
async function sendMessage(opts, personName, message, options = {}) {
  const timeout = options.timeout ?? 20000;

  const opened = await openConversation(opts, personName, { timeout });
  if (!opened.ok) return { ok: false, message, to: personName, error: opened.error };

  // LinkedIn's composer is a contenteditable; set text and trigger input so
  // the send button becomes enabled.
  await fillContenteditable(COMPOSER_SELECTOR, message, opts);

  // Small pause to let the framework react to the input event.
  evalJS(`new Promise(r => setTimeout(r, 300)).then(() => 'ok')`, opts);

  const sendClicked = evalJS(`(function(){
    var b = document.querySelector(${JSON.stringify(SEND_BUTTON_SELECTOR)});
    if (!b) return 'not_found';
    b.click();
    return 'clicked';
  })()`, opts);
  if (sendClicked !== 'clicked') return { ok: false, message, to: personName, error: 'send button not found' };

  // Wait for the message to appear in the thread.
  const snippet = message.slice(0, 60);
  try { await waitForText(opts, snippet, { timeout }); } catch { /* verified below */ }

  // Ensure the message is inside the message list container.
  const sent = evalJS(`(function(){
    var list = document.querySelector(${JSON.stringify(MESSAGE_LIST_SELECTOR)});
    return list && list.innerText.includes(${JSON.stringify(snippet)}) ? 'yes' : 'no';
  })()`, opts) === 'yes';

  return { ok: sent, message, to: personName, url: evalJS('window.location.href', opts) };
}

module.exports = { sendMessage };

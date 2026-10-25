#!/usr/bin/env node
/**
 * openConversation.js — Open a LinkedIn conversation by name.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Pass { session, tab } to target a specific
 * session/tab. Searches the conversation list, clicks the match, and waits
 * for the thread to load.
 *
 * Usage:
 *   const { openConversation } = require('./scripts/linkedin/openConversation');
 *   openConversation({ session: 'default' }, '<Recipient Name>');
 */
'use strict';

const { goto, evalJS, waitFor, waitForSelector } = require('../../lib/browser-helpers');
const { waitForText } = require('../lib/dom-helpers');

const MESSAGING_URL = 'https://www.linkedin.com/messaging/';
const LIST_ITEM_SELECTOR = 'div.msg-conversation-listitem__link';
const MESSAGE_LIST_SELECTOR = 'ul.msg-s-message-list, .msg-s-message-list';

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {string} personName
 * @param {{ timeout?: number }?} options
 */
async function openConversation(opts, personName, options = {}) {
  const timeout = options.timeout ?? 15000;

  // Ensure we are on the messaging list view.
  const url = evalJS('window.location.href', opts);
  if (!url || !url.includes('/messaging')) {
    goto(MESSAGING_URL, opts);
  }

  // Wait for the conversation list to render.
  if (!waitForSelector(LIST_ITEM_SELECTOR, { ...opts, timeout })) {
    return { ok: false, error: 'conversation list did not render' };
  }

  // Find the list item with the requested name and click it.
  const clicked = evalJS(`(function(){
    var els = document.querySelectorAll(${JSON.stringify(LIST_ITEM_SELECTOR)});
    for (var i = 0; i < els.length; i++) {
      if (els[i].textContent.includes(${JSON.stringify(personName)})) { els[i].click(); return 'clicked'; }
    }
    return 'not_found';
  })()`, opts);

  if (clicked !== 'clicked') {
    // Fallback: click any element containing the name.
    const fb = evalJS(`(function(){
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      var n;
      while (n = w.nextNode()) {
        if (n.children.length === 0 && n.textContent.trim() === ${JSON.stringify(personName)}) { n.click(); return 'clicked'; }
      }
      return 'not_found';
    })()`, opts);
    if (fb !== 'clicked') return { ok: false, error: `conversation for "${personName}" not found` };
  }

  // Wait for the thread view and message list.
  waitFor(`window.location.href.includes('/messaging/thread/')`, { ...opts, timeout });
  waitForSelector(MESSAGE_LIST_SELECTOR, { ...opts, timeout });
  try { await waitForText(opts, personName, { timeout }); } catch { /* best effort */ }

  return { ok: true, url: evalJS('window.location.href', opts) };
}

module.exports = { openConversation };

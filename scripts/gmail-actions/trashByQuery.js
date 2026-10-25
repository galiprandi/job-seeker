#!/usr/bin/env node
/**
 * trashByQuery.js — Move all Gmail messages matching a search to trash.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Navigates to the search result, selects all visible
 * conversations (and all conversations in the search if prompted), then clicks
 * the delete button while dispatching the full mouse event sequence.
 *
 * Usage:
 *   const { trashByQuery } = require('./scripts/gmail-actions/trashByQuery');
 *   trashByQuery({ session: 'default' }, 'from:recruiter@example.com');
 */
'use strict';

const { goto, evalJS, sleep } = require('../../lib/browser-helpers');
const { clickWithEvents, waitForText } = require('../lib/dom-helpers');

const GMAIL_SEARCH_BASE = 'https://mail.google.com/mail/u/0/#search/';
const DELETE_BUTTON_SELECTOR = 'div[aria-label="Eliminar"].nX, div[aria-label="Delete"].nX';

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {string} query
 * @param {{ timeout?: number }?} options
 */
async function trashByQuery(opts, query, options = {}) {
  const timeout = options.timeout ?? 30000;

  const url = `${GMAIL_SEARCH_BASE}${encodeURIComponent(query)}`;
  goto(url, opts);

  // Wait for the conversation list or the empty-search message.
  sleep(1500);

  const hasMessages = evalJS(`(function(){
    return !!document.querySelector('table[role="grid"] tr, .Cp table tr, [role="listitem"]');
  })()`, opts) === 'true';

  if (!hasMessages) {
    return { ok: true, moved: 0, query, note: 'no visible messages' };
  }

  // Click the main select-all checkbox.
  evalJS(`(function(){
    var cb = document.querySelector('div[role="checkbox"][aria-label*="Select"], div[role="checkbox"][aria-label*="select"]');
    if (cb) cb.click();
    return cb ? 'clicked' : 'not_found';
  })()`, opts);

  // If Gmail offers to select every conversation in the search, accept it.
  const bannerClicked = evalJS(`(function(){
    var els = document.querySelectorAll('span, div, a');
    for (var i = 0; i < els.length; i++) {
      if (/Select all \\d+ conversations? in/.test(els[i].textContent)) { els[i].click(); return 'clicked'; }
    }
    return 'not_found';
  })()`, opts);
  if (bannerClicked === 'clicked') sleep(500);

  // Click the delete button using mousedown/click/mouseup.
  try {
    await clickWithEvents(DELETE_BUTTON_SELECTOR, opts);
  } catch {
    return { ok: false, query, error: 'delete button not found' };
  }

  // Wait for the trash confirmation.
  const moved = await waitForText(opts, /conversation moved to trash|moved to trash|elimin/i, { timeout })
    .then(() => true)
    .catch(() => false);

  return { ok: moved, query, url: evalJS('window.location.href', opts) };
}

module.exports = { trashByQuery };

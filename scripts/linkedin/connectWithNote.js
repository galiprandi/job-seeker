#!/usr/bin/env node
/**
 * connectWithNote.js — Send a LinkedIn connection request with an optional note.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Navigates to the profile, opens the connect dialog,
 * adds a note if one is provided, and sends the invitation.
 *
 * Usage:
 *   const { connectWithNote } = require('./scripts/linkedin/connectWithNote');
 *   connectWithNote({ session: 'default' }, 'https://www.linkedin.com/in/vanity', 'Hi!');
 */
'use strict';

const { goto, evalJS, waitForSelector } = require('../../lib/browser-helpers');
const { waitForText, handleDialog } = require('../lib/dom-helpers');

const CONNECT_SELECTORS = [
  'button[aria-label^="Connect"][type="button"]',
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
  'button[aria-label="Send"][type="button"]',
  'button.ml1[type="submit"]',
];

function clickFirstOf(selectors, opts) {
  return evalJS(`(function(){
    var sels = ${JSON.stringify(selectors)};
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) { el.click(); return 'clicked'; }
    }
    // Fallback: any visible button whose label/text contains Connect/Send
    return 'not_found';
  })()`, opts);
}

function clickButtonByText(text, opts) {
  return evalJS(`(function(){
    var bs = document.querySelectorAll('button, [role="button"]');
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})) { bs[i].click(); return 'clicked'; }
    }
    return 'not_found';
  })()`, opts);
}

function fillFirstOf(selectors, value, opts) {
  return evalJS(`(function(){
    var sels = ${JSON.stringify(selectors)};
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) {
        el.focus();
        el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'filled';
      }
    }
    return 'not_found';
  })()`, opts);
}

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {string} profileUrl
 * @param {string} [note]
 * @param {{ timeout?: number }?} options
 */
async function connectWithNote(opts, profileUrl, note, options = {}) {
  const timeout = options.timeout ?? 20000;

  // Neutralize leave-confirmation dialogs.
  handleDialog(opts);

  goto(profileUrl, opts);
  waitForSelector('main, body', { ...opts, timeout });

  // Primary connect button.
  if (clickFirstOf(CONNECT_SELECTORS, opts) !== 'clicked') {
    if (clickButtonByText('Connect', opts) !== 'clicked') {
      return { ok: false, profileUrl, note: note || null, error: 'connect button not found' };
    }
  }

  // Wait for the invitation modal.
  waitForSelector('div[role="dialog"]', { ...opts, timeout });

  if (note && note.trim()) {
    clickButtonByText('Add a note', opts);
    waitForSelector(NOTE_FIELD_SELECTORS.join(', '), { ...opts, timeout: 5000 });
    fillFirstOf(NOTE_FIELD_SELECTORS, note, opts);
  }

  if (clickFirstOf(SEND_SELECTORS, opts) !== 'clicked') {
    clickButtonByText('Send', opts);
  }

  // Confirm the request was sent or the profile already shows a pending state.
  let confirmed = false;
  try {
    await waitForText(opts, /invitation was sent|invite sent|pending/i, { timeout: 5000 });
    confirmed = true;
  } catch {
    confirmed = evalJS(`(function(){
      var el = document.querySelector('span');
      var t = document.body.innerText;
      return /pending/i.test(t) ? 'yes' : 'no';
    })()`, opts) === 'yes';
  }

  return { ok: confirmed, profileUrl, note: note || null };
}

module.exports = { connectWithNote };

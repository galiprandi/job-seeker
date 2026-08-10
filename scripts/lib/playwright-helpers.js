#!/usr/bin/env node
/**
 * playwright-helpers.js — Reusable Playwright interaction primitives.
 *
 * These helpers are designed to be used with a Playwright Page object that is
 * managed by the browser wrapper (scripts/browser.js) or by a persistent
 * context that uses the .browser-profile directory.
 *
 * The functions below do NOT open or close the browser. The caller is
 * responsible for lifecycle: open with `node scripts/browser.js open`, run the
 * action, then close with `node scripts/browser.js close`.
 *
 * Exports:
 *   waitForText(page, text, options)
 *   clickWithEvents(element)
 *   fillContenteditable(element, text)
 *   handleDialog(page, callback)
 */
'use strict';

const DEFAULT_TIMEOUT = 10000;

/**
 * Wait until the page body contains the expected text or matches a regex.
 *
 * @param {import('playwright-core').Page} page
 * @param {string|RegExp} text
 * @param {{ timeout?: number }?} options
 */
async function waitForText(page, text, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  if (text instanceof RegExp) {
    const pattern = text.source;
    const flags = text.flags;
    return page.waitForFunction(
      ({ pattern, flags }) => new RegExp(pattern, flags).test(document.body.innerText),
      { pattern, flags },
      { timeout }
    );
  }

  return page.waitForFunction(
    (target) => document.body.innerText.includes(target),
    text,
    { timeout }
  );
}

/**
 * Click an element while dispatching mousedown, click, and mouseup in order.
 *
 * @param {import('playwright-core').Locator|import('playwright-core').ElementHandle} element
 */
async function clickWithEvents(element) {
  return element.evaluate((el) => {
    if (!el) {
      throw new Error('clickWithEvents: element not found');
    }

    const mouseOptions = { bubbles: true, cancelable: true, view: window };

    el.dispatchEvent(new MouseEvent('mousedown', mouseOptions));
    el.dispatchEvent(new MouseEvent('click', mouseOptions));
    el.dispatchEvent(new MouseEvent('mouseup', mouseOptions));

    return true;
  });
}

/**
 * Fill a contenteditable element (e.g. LinkedIn message composer) and trigger
 * the input/change events that frameworks listen to.
 *
 * @param {import('playwright-core').Locator|import('playwright-core').ElementHandle} element
 * @param {string} text
 */
async function fillContenteditable(element, text) {
  return element.evaluate((el, value) => {
    if (!el) {
      throw new Error('fillContenteditable: element not found');
    }

    el.focus();

    // Prefer textContent for contenteditable; preserves plain text.
    el.textContent = value;

    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
    }));

    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    return true;
  }, text);
}

/**
 * Attach a dialog handler. Useful for beforeunload prompts and modals that
 * otherwise block navigation.
 *
 * The callback receives the Playwright Dialog object. If no callback is
 * provided, beforeunload prompts are accepted and all other dialogs are
 * accepted by default.
 *
 * @param {import('playwright-core').Page} page
 * @param {(dialog: import('playwright-core').Dialog) => Promise<void>|void} [callback]
 */
function handleDialog(page, callback) {
  page.on('dialog', async (dialog) => {
    try {
      if (typeof callback === 'function') {
        await callback(dialog);
      } else if (dialog.type() === 'beforeunload') {
        await dialog.accept();
      } else {
        await dialog.accept();
      }
    } catch (err) {
      // Defensive: dismiss the dialog so the page is not left hanging.
      await dialog.dismiss().catch(() => {});
    }
  });
}

module.exports = {
  waitForText,
  clickWithEvents,
  fillContenteditable,
  handleDialog,
};

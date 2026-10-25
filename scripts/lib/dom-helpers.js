/**
 * dom-helpers.js — Reusable DOM interaction primitives (agent-browser backend).
 *
 * Migrated from the Page-object model: agent-browser has no run-code / Page API,
 * so these helpers take a { session, tab } options object and CSS selectors
 * instead of Playwright Page/Locator objects. Everything runs through the
 * browser wrapper via lib/browser-helpers.js (eval + in-page polling).
 *
 * The functions below do NOT open or close the browser. The caller is
 * responsible for lifecycle: open with
 * `node .agents/skills/browser-automation/scripts/browser.js open <url>`,
 * run the action, then `... browser.js close` (or leave it running).
 *
 * Exports:
 *   waitForText(opts, text|RegExp, { timeout })
 *   clickWithEvents(selector, opts)
 *   fillContenteditable(selector, text, opts)
 *   handleDialog(opts)
 */
'use strict';

const { evalJS, waitFor } = require('../../lib/browser-helpers');

const DEFAULT_TIMEOUT = 10000;

/**
 * Wait until the page body contains the expected text or matches a regex.
 *
 * @param {{ session?: string, tab?: string }} opts
 * @param {string|RegExp} text
 * @param {{ timeout?: number }?} options
 */
async function waitForText(opts, text, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const cond = text instanceof RegExp
    ? `new RegExp(${JSON.stringify(text.source)}, ${JSON.stringify(text.flags)}).test(document.body.innerText)`
    : `document.body.innerText.includes(${JSON.stringify(text)})`;

  const ok = waitFor(cond, { ...opts, timeout });
  if (!ok) throw new Error(`waitForText timed out after ${timeout}ms`);
}

/**
 * Click an element while dispatching mousedown, click, and mouseup in order.
 *
 * @param {string} selector - CSS selector (first match wins)
 * @param {{ session?: string, tab?: string }} opts
 */
async function clickWithEvents(selector, opts = {}) {
  const code = `(function(){
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('clickWithEvents: element not found: ' + ${JSON.stringify(selector)});
    var o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('click', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    return true;
  })()`;
  const r = evalJS(code, opts);
  if (r !== 'true') throw new Error(`clickWithEvents failed on ${selector}`);
}

/**
 * Fill a contenteditable element (e.g. LinkedIn message composer) and trigger
 * the input/change events that frameworks listen to.
 *
 * @param {string} selector - CSS selector (first match wins)
 * @param {string} text
 * @param {{ session?: string, tab?: string }} opts
 */
async function fillContenteditable(selector, text, opts = {}) {
  const code = `(function(){
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('fillContenteditable: element not found: ' + ${JSON.stringify(selector)});
    el.focus();
    el.textContent = ${JSON.stringify(text)};
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true, inputType: 'insertText', data: ${JSON.stringify(text)},
    }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    return true;
  })()`;
  const r = evalJS(code, opts);
  if (r !== 'true') throw new Error(`fillContenteditable failed on ${selector}`);
}

/**
 * Neutralize dialogs that block navigation (beforeunload). agent-browser has
 * no page.on('dialog') hook, so this clears the handler via eval — call it
 * once after navigation. Kept under the old name for API compatibility.
 *
 * @param {{ session?: string, tab?: string }} opts
 */
function handleDialog(opts) {
  evalJS(`window.onbeforeunload = null; 'done'`, opts || {});
}

module.exports = {
  waitForText,
  clickWithEvents,
  fillContenteditable,
  handleDialog,
};

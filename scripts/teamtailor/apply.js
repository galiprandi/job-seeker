#!/usr/bin/env node
/**
 * teamtailor/apply.js — Fill and submit a Teamtailor job application.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Pass { session, tab } as the first argument.
 * Navigates to the job's /applications/new path, fills the candidate fields,
 * selects country and location, uploads a CV, fills the cover letter, checks
 * the privacy box, submits, and verifies the confirmation page.
 *
 * Usage:
 *   const { apply } = require('./scripts/teamtailor/apply');
 *   apply({ session: 'default' }, {
 *     jobUrl: 'https://job.site/jobs/123',
 *     firstName: '<FirstName>',
 *     lastName: '<LastName>',
 *     email: '<email@example.com>',
 *     phone: '<+CountryCode Area Number>',
 *     country: '<Country>',
 *     location: '<City>',
 *     cvPath: '/path/to/cv.pdf',
 *     coverLetter: 'I am excited...',
 *   });
 */
'use strict';

const { goto, evalJS, execSub, sq, waitForSelector } = require('../../lib/browser-helpers');
const { waitForText, handleDialog } = require('../lib/dom-helpers');

const FIELD_SELECTORS = {
  firstName: [
    'input[name="job_application[first_name]"]',
    'input[name*="first_name"]',
    'input#job_application_first_name',
    'input[id*="first-name"]',
    'input[placeholder*="Nombre"]',
    'input[placeholder*="First name"]',
  ],
  lastName: [
    'input[name="job_application[last_name]"]',
    'input[name*="last_name"]',
    'input#job_application_last_name',
    'input[id*="last-name"]',
    'input[placeholder*="Apellidos"]',
    'input[placeholder*="Last name"]',
  ],
  email: [
    'input[name="job_application[email]"][type="email"]',
    'input[type="email"][name*="email"]',
    'input#job_application_email',
    'input[placeholder*="Correo"]',
    'input[placeholder*="Email"]',
  ],
  phone: [
    'input[name="job_application[phone]"]',
    'input[type="tel"]',
    'input[name*="phone"]',
    'input#job_application_phone',
    'input[placeholder*="Tel"]',
  ],
  country: [
    'select[name="job_application[country]"]',
    'select[name*="country"]',
    'select[id*="country"]',
  ],
  location: [
    'select[name="job_application[location]"]',
    'select[name*="location"]',
    'input[name*="location"]',
    'input[id*="location"]',
  ],
  coverLetter: [
    'textarea[name="job_application[cover_letter]"]',
    'textarea[name*="cover_letter"]',
    'textarea[name*="cover"]',
    'textarea[placeholder*="carta"]',
    'textarea[placeholder*="letter"]',
    'textarea',
  ],
  privacy: [
    'input[type="checkbox"][name*="privacy"]',
    'input[type="checkbox"][name*="consent"]',
    'input[type="checkbox"][name*="gdpr"]',
    'input[type="checkbox"][name*="terms"]',
    'input[type="checkbox"]',
  ],
  submit: [
    'button[type="submit"][name="commit"]',
    'button[type="submit"]',
    'input[type="submit"]',
  ],
};

/** Return the first matching visible selector for a field, or null. */
function firstVisibleSelector(key, opts) {
  return evalJS(`(function(){
    var sels = ${JSON.stringify(FIELD_SELECTORS[key])};
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el && el.offsetParent !== null) return sels[i];
    }
    return null;
  })()`, opts);
}

function safeFill(key, value, opts) {
  if (value === undefined || value === null) return false;
  const sel = firstVisibleSelector(key, opts);
  if (!sel) return false;
  execSub(`fill ${sq(sel)} ${sq(String(value))}`, opts, 15000);
  return true;
}

function safeSelect(key, value, opts) {
  if (value === undefined || value === null) return false;
  const sel = firstVisibleSelector(key, opts);
  if (!sel) return false;
  const tag = evalJS(`(function(){var el=document.querySelector(${JSON.stringify(sel)});return el?el.tagName.toLowerCase():'input';})()`, opts);
  if (tag === 'select') {
    execSub(`select ${sq(sel)} ${sq(String(value))}`, opts, 15000);
  } else {
    execSub(`fill ${sq(sel)} ${sq(String(value))}`, opts, 15000);
  }
  return true;
}

function checkPrivacy(opts) {
  const sel = firstVisibleSelector('privacy', opts);
  if (!sel) return false;
  const checked = evalJS(`(function(){var el=document.querySelector(${JSON.stringify(sel)});return el?!!el.checked:true;})()`, opts);
  if (checked !== 'true') execSub(`check ${sq(sel)}`, opts, 15000);
  return true;
}

function uploadCv(cvPath, opts) {
  const sel = evalJS(`(function(){
    var el = document.querySelector('input[type="file"]');
    return el ? 'input[type="file"]' : null;
  })()`, opts);
  if (!sel) return false;
  execSub(`upload ${sq(sel)} ${sq(cvPath)}`, opts, 30000);
  return true;
}

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {{
 *   jobUrl: string,
 *   firstName?: string,
 *   lastName?: string,
 *   email?: string,
 *   phone?: string,
 *   country?: string,
 *   location?: string,
 *   cvPath?: string,
 *   coverLetter?: string,
 * }} data
 * @param {{ timeout?: number }?} options
 */
async function apply(opts, data, options = {}) {
  const timeout = options.timeout ?? 30000;
  const appUrl = data.jobUrl.replace(/\/?$/, '') + '/applications/new';

  // Prevent leave-confirmation dialogs from interrupting the submit.
  handleDialog(opts);

  goto(appUrl, opts);
  waitForSelector('form', { ...opts, timeout });

  // Basic text fields.
  for (const key of ['firstName', 'lastName', 'email', 'phone']) {
    if (data[key]) safeFill(key, data[key], opts);
  }

  // Country and location.
  if (data.country) safeSelect('country', data.country, opts);
  if (data.location) safeSelect('location', data.location, opts);

  // CV upload.
  if (data.cvPath) uploadCv(data.cvPath, opts);

  // Cover letter.
  if (data.coverLetter) safeFill('coverLetter', data.coverLetter, opts);

  // Privacy checkbox.
  checkPrivacy(opts);

  // Submit.
  const submitSel = firstVisibleSelector('submit', opts);
  if (submitSel) execSub(`click ${sq(submitSel)}`, opts, 15000);

  // Wait for the confirmation page or banner.
  const confirmed = await waitForText(opts, /thank|gracias|application received|sent|success/i, { timeout })
    .then(() => true)
    .catch(() => false);

  return { ok: confirmed, jobUrl: data.jobUrl, url: evalJS('window.location.href', opts) };
}

module.exports = { apply };

#!/usr/bin/env node
/**
 * teamtailor/apply.js — Fill and submit a Teamtailor job application.
 *
 * Expects a Playwright Page object and an application data object. Navigates to
 * the job's /applications/new path, fills the candidate fields, selects country
 * and location, uploads a CV, fills the cover letter, checks the privacy box,
 * submits, and verifies the confirmation page.
 *
 * Usage:
 *   const { apply } = require('./scripts/teamtailor/apply');
 *   await apply(page, {
 *     jobUrl: 'https://job.site/jobs/123',
 *     firstName: 'Jane',
 *     lastName: 'Doe',
 *     email: 'jane@example.com',
 *     phone: '+1 555 123 4567',
 *     country: 'Spain',
 *     location: 'Madrid',
 *     cvPath: '/path/to/cv.pdf',
 *     coverLetter: 'I am excited...',
 *   });
 */
'use strict';

const { waitForText, handleDialog } = require('../lib/playwright-helpers');

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

async function safeFill(page, key, value) {
  const locator = page.locator(FIELD_SELECTORS[key].join(', ')).first();
  const visible = await locator.isVisible().catch(() => false);
  if (!visible || value === undefined || value === null) return false;

  // select/deselect handling is done separately.
  await locator.fill(String(value));
  return true;
}

async function safeSelect(page, key, value) {
  const locator = page.locator(FIELD_SELECTORS[key].join(', ')).first();
  const visible = await locator.isVisible().catch(() => false);
  if (!visible || value === undefined || value === null) return false;

  const tag = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'input');
  if (tag === 'select') {
    await locator.selectOption(String(value), { timeout: 5000 });
  } else {
    await locator.fill(String(value));
  }
  return true;
}

async function checkPrivacy(page) {
  const locator = page.locator(FIELD_SELECTORS.privacy.join(', ')).first();
  const visible = await locator.isVisible().catch(() => false);
  if (!visible) return false;

  const checked = await locator.isChecked().catch(() => true);
  if (!checked) await locator.check();
  return true;
}

async function uploadCv(page, cvPath) {
  const fileInput = page.locator('input[type="file"]').first();
  const visible = await fileInput.isVisible().catch(() => false);
  if (!visible) return false;

  await fileInput.setInputFiles(cvPath);
  return true;
}

/**
 * @param {import('playwright-core').Page} page
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
async function apply(page, data, options = {}) {
  const timeout = options.timeout ?? 30000;
  const appUrl = data.jobUrl.replace(/\/?$/, '') + '/applications/new';

  // Prevent leave-confirmation dialogs from interrupting the submit.
  handleDialog(page);

  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout });

  // Basic text fields.
  for (const key of ['firstName', 'lastName', 'email', 'phone']) {
    if (data[key]) await safeFill(page, key, data[key]);
  }

  // Country and location.
  if (data.country) await safeSelect(page, 'country', data.country);
  if (data.location) await safeSelect(page, 'location', data.location);

  // CV upload.
  if (data.cvPath) await uploadCv(page, data.cvPath);

  // Cover letter.
  if (data.coverLetter) {
    await safeFill(page, 'coverLetter', data.coverLetter);
  }

  // Privacy checkbox.
  await checkPrivacy(page);

  // Submit.
  const submitButton = page.locator(FIELD_SELECTORS.submit.join(', ')).first();
  await submitButton.waitFor({ state: 'visible', timeout });
  await submitButton.click({ timeout });

  // Wait for the confirmation page or banner.
  const confirmed = await waitForText(page, /thank|gracias|application received|sent|success/i, { timeout })
    .then(() => true)
    .catch(() => false);

  return { ok: confirmed, jobUrl: data.jobUrl, url: page.url() };
}

module.exports = { apply };

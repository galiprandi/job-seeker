#!/usr/bin/env node
/**
 * savedJobs.js — Extract saved / in-progress / applied jobs from LinkedIn.
 *
 * Expects a Playwright Page object already on a LinkedIn session opened via
 * the browser wrapper. Navigates to the saved-jobs page and returns a flat list
 * of job cards with their visible status.
 *
 * Usage:
 *   const { savedJobs } = require('./scripts/linkedin/savedJobs');
 *   const jobs = await savedJobs(page);
 */
'use strict';

const SAVED_JOBS_URL = 'https://www.linkedin.com/my-items/saved-jobs/';

/**
 * @param {import('playwright-core').Page} page
 * @param {{ timeout?: number }?} options
 * @returns {Promise<Array<{ title: string, company: string, location: string, status: string, url: string }>>}
 */
async function savedJobs(page, options = {}) {
  const timeout = options.timeout ?? 20000;

  await page.goto(SAVED_JOBS_URL, { waitUntil: 'domcontentloaded', timeout });

  // Wait for at least one job card-ish container or for the list to finish.
  await page.locator('.reusable-search__result-container, .job-card-container, [data-view-name="job-card"]').first().waitFor({ timeout }).catch(() => {});

  const jobs = await page.evaluate(() => {
    const results = [];

    // Try several known LinkedIn card wrappers.
    const cards = document.querySelectorAll(
      '.reusable-search__result-container, .job-card-container, [data-view-name="job-card"], .job-card-list__item, .jobs-saved-jobs-card'
    );

    for (const card of cards) {
      const titleEl =
        card.querySelector('a.job-card-list__title, a.job-card-container__link, h3 a, a[href*="/jobs/view/"]') ||
        card.querySelector('a strong, a h3, a span');

      const companyEl =
        card.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle, [class*="company"]') ||
        card.querySelector('span[dir="ltr"]');

      const locationEl =
        card.querySelector('.job-card-container__metadata-item, [class*="location"], [class*="metadata"]');

      const statusEl =
        card.querySelector('.tvm__text, [class*="status"], [class*="applied"], [class*="saved"]') ||
        card;

      const title = titleEl ? titleEl.textContent.trim() : '';
      const company = companyEl ? companyEl.textContent.trim() : '';
      const location = locationEl ? locationEl.textContent.trim() : '';
      const rawStatus = statusEl ? statusEl.textContent.trim() : '';

      let status = 'saved';
      const statusText = rawStatus.toLowerCase();
      if (statusText.includes('applied')) status = 'applied';
      else if (statusText.includes('in progress') || statusText.includes('in-progress')) status = 'in-progress';
      else if (statusText.includes('saved')) status = 'saved';

      const url = titleEl && titleEl.href ? titleEl.href : '';

      if (title) {
        results.push({ title, company, location, status, url });
      }
    }

    return results;
  });

  return jobs;
}

module.exports = { savedJobs };

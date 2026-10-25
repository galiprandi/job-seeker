#!/usr/bin/env node
/**
 * savedJobs.js — Extract saved / in-progress / applied jobs from LinkedIn.
 *
 * Works against a live browser session opened via the browser wrapper
 * (agent-browser backend). Navigates to the saved-jobs page and returns a flat
 * list of job cards with their visible status.
 *
 * Usage:
 *   const { savedJobs } = require('./scripts/linkedin/savedJobs');
 *   const jobs = savedJobs({ session: 'default' });
 */
'use strict';

const { goto, evalJSON, waitFor } = require('../../lib/browser-helpers');

const SAVED_JOBS_URL = 'https://www.linkedin.com/my-items/saved-jobs/';

/**
 * @param {{ session?: string, tab?: string }} opts
 * @param {{ timeout?: number }?} options
 * @returns {Array<{ title: string, company: string, location: string, status: string, url: string }>}
 */
function savedJobs(opts, options = {}) {
  const timeout = options.timeout ?? 20000;

  goto(SAVED_JOBS_URL, opts);

  // Wait for at least one job card-ish container or for the list to finish.
  waitFor(
    `document.querySelectorAll('.reusable-search__result-container, .job-card-container, [data-view-name="job-card"]').length > 0`,
    { ...opts, timeout }
  );

  const jobs = evalJSON(`(function(){
    var results = [];
    var cards = document.querySelectorAll(
      '.reusable-search__result-container, .job-card-container, [data-view-name="job-card"], .job-card-list__item, .jobs-saved-jobs-card'
    );
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var titleEl =
        card.querySelector('a.job-card-list__title, a.job-card-container__link, h3 a, a[href*="/jobs/view/"]') ||
        card.querySelector('a strong, a h3, a span');
      var companyEl =
        card.querySelector('.job-card-container__company-name, .artdeco-entity-lockup__subtitle, [class*="company"]') ||
        card.querySelector('span[dir="ltr"]');
      var locationEl =
        card.querySelector('.job-card-container__metadata-item, [class*="location"], [class*="metadata"]');
      var statusEl =
        card.querySelector('.tvm__text, [class*="status"], [class*="applied"], [class*="saved"]') || card;

      var title = titleEl ? titleEl.textContent.trim() : '';
      var company = companyEl ? companyEl.textContent.trim() : '';
      var location = locationEl ? locationEl.textContent.trim() : '';
      var rawStatus = statusEl ? statusEl.textContent.trim() : '';

      var status = 'saved';
      var statusText = rawStatus.toLowerCase();
      if (statusText.includes('applied')) status = 'applied';
      else if (statusText.includes('in progress') || statusText.includes('in-progress')) status = 'in-progress';
      else if (statusText.includes('saved')) status = 'saved';

      var url = titleEl && titleEl.href ? titleEl.href : '';
      if (title) results.push({ title: title, company: company, location: location, status: status, url: url });
    }
    return results;
  })()`, opts);

  return jobs || [];
}

module.exports = { savedJobs };

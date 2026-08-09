/**
 * Reads social data (github_repo_url, docs_url, handles, full_name) from users.data.social.
 * Used by outreach scripts to avoid hardcoding personal data.
 */
const { execSync } = require('child_process');

function getSocial() {
  try {
    const out = execSync('node scripts/db.js "SELECT data->\'social\' AS social FROM users WHERE id = 1"', {
      encoding: 'utf8',
      cwd: __dirname + '/..',
      timeout: 10000,
    });
    const rows = JSON.parse(out);
    return rows[0]?.social || {};
  } catch {
    return {};
  }
}

module.exports = { getSocial };

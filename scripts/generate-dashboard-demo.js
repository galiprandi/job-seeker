#!/usr/bin/env node
/**
 * generate-dashboard-demo.js
 *
 * Reads scripts/templates/dashboard.html, replaces the fetch logic with
 * hardcoded placeholder data, and writes assets/dashboard-demo.html.
 * Used to generate screenshots for the README without exposing real
 * candidate data (Gold Rule 9).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(repoRoot, 'scripts/templates/dashboard.html'), 'utf8');

// Replace the skeleton + script section with pre-rendered placeholder data
const cssEnd = src.indexOf('</style>');
const css = src.slice(0, cssEnd + '</style>'.length);

const placeholderData = {
  userName: '<Your Name>',
  lastApplication: new Date(Date.now() - 3600000).toISOString(),
  funnel: {
    discovered: 3,
    contacted: 5,
    applied: 16,
    in_review: 2,
    screening: 1,
    interview: 2,
    offer: 0,
    hired: 0,
    rejected: 2,
    withdrawn: 0,
    skipped: 1,
  },
  active: [
    { id: 42, company: 'TechCorp', role: 'Principal Engineer', status: 'discovered', match: 'low', platform: 'linkedin', applied_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 41, company: 'DataFlow Inc', role: 'Engineering Manager', status: 'discovered', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 90000000).toISOString() },
    { id: 40, company: 'NeuralLabs', role: 'AI Engineer', status: 'contacted', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 172800000).toISOString() },
    { id: 39, company: 'ScaleUp Tech', role: 'Eng Manager', status: 'contacted', match: 'high', platform: 'email', applied_at: new Date(Date.now() - 190000000).toISOString() },
    { id: 38, company: 'Vertex AI', role: 'Senior Backend Engineer', status: 'contacted', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 205000000).toISOString() },
    { id: 37, company: 'QuantumSoft', role: 'Full Stack AI Engineer', status: 'contacted', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 220000000).toISOString() },
    { id: 33, company: 'OpenAI', role: 'Engineering Manager', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 259200000).toISOString() },
    { id: 32, company: 'Anthropic', role: 'Senior AI Engineer', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 270000000).toISOString() },
    { id: 31, company: 'Hugging Face', role: 'Platform Engineer', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 280000000).toISOString() },
    { id: 30, company: 'Vercel', role: 'DX Engineer', status: 'applied', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 290000000).toISOString() },
    { id: 29, company: 'Supabase', role: 'Backend Engineer', status: 'applied', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 300000000).toISOString() },
    { id: 28, company: 'Neon', role: 'Developer Advocate', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 310000000).toISOString() },
    { id: 27, company: 'Resend', role: 'Full Stack Engineer', status: 'applied', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 320000000).toISOString() },
    { id: 26, company: 'Cursor', role: 'AI Engineer', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 330000000).toISOString() },
    { id: 25, company: 'Linear', role: 'Engineering Manager', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 340000000).toISOString() },
    { id: 24, company: 'Raycast', role: 'Senior Engineer', status: 'applied', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 350000000).toISOString() },
    { id: 23, company: 'Cal.com', role: 'Full Stack Engineer', status: 'applied', match: 'medium', platform: 'linkedin', applied_at: new Date(Date.now() - 360000000).toISOString() },
    { id: 22, company: 'PostHog', role: 'Platform Engineer', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 370000000).toISOString() },
    { id: 21, company: 'LangChain', role: 'Senior AI Engineer', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 380000000).toISOString() },
    { id: 20, company: 'Pinecone', role: 'Engineering Manager', status: 'applied', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 390000000).toISOString() },
    { id: 17, company: 'Cohere', role: 'AI Engineer', status: 'in_review', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 432000000).toISOString() },
    { id: 16, company: 'Replicate', role: 'Platform Engineer', status: 'in_review', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 450000000).toISOString() },
    { id: 15, company: 'Perplexity', role: 'Senior AI Engineer', status: 'screening', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 460000000).toISOString() },
    { id: 14, company: 'DeepSeek', role: 'AI Architect', status: 'interview', match: 'high', platform: 'linkedin', applied_at: new Date(Date.now() - 500000000).toISOString() },
    { id: 13, company: 'Together AI', role: 'Engineering Manager', status: 'interview', match: 'low', platform: 'linkedin', applied_at: new Date(Date.now() - 520000000).toISOString() },
  ],
  targets: {
    registered: 12,
    pending: 8,
    no_fit: 3,
    manual_login_needed: 2,
    applied: 5,
  },
  messages: [
    { sender: 'Sarah Chen', channel: 'linkedin', subject: 'Following up on your application', status: 'pending', received_at: new Date(Date.now() - 3600000).toISOString() },
    { sender: 'recruiting@techcorp.com', channel: 'gmail', subject: 'Interview scheduling for AI Engineer role', status: 'draft', received_at: new Date(Date.now() - 7200000).toISOString() },
    { sender: 'Mike Johnson', channel: 'linkedin', subject: 'Re: Engineering Manager position', status: 'sent', received_at: new Date(Date.now() - 86400000).toISOString() },
    { sender: 'talent@startup.io', channel: 'gmail', subject: 'Thanks for your application', status: 'ignored', received_at: new Date(Date.now() - 172800000).toISOString() },
  ],
};

// Extract the JS render functions from the template (between <script> and </script>)
const scriptStart = src.indexOf('<script>');
const scriptEnd = src.indexOf('</script>');
let jsCode = src.slice(scriptStart + '<script>'.length, scriptEnd);

// Remove the loadData() call and setInterval that would try to fetch /api/data
jsCode = jsCode.replace(/loadData\(\);\s*setInterval\(loadData,\s*\d+\);/, '');

// Build the demo HTML: same CSS, same render functions, but call renderApp with placeholder data
const demoHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Job Seeker Dashboard — Demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${css}
</head>
<body>
<div id="app"></div>
<script>
${jsCode}

// Replace loadData with static placeholder data
const PLACEHOLDER_DATA = ${JSON.stringify(placeholderData, null, 2)};

document.getElementById('app').innerHTML = renderApp(PLACEHOLDER_DATA);

// Theme toggle still works
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('dashboard-theme', next);
}

(function initTheme() {
  const saved = localStorage.getItem('dashboard-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
</script>
</body>
</html>
`;

const outPath = path.join(repoRoot, 'assets/dashboard-demo.html');
fs.writeFileSync(outPath, demoHtml);
console.log(`Wrote ${outPath}`);

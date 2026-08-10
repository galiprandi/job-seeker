#!/usr/bin/env node
/**
 * generate-cv.js — Convert CV Markdown to PDF via headless browser.
 *
 * Reads CV Markdown from the DB (users.data.cv_markdown) or from a file,
 * converts it to HTML with a clean professional CSS layout, renders it in
 * a headless browser, and exports to PDF.
 *
 * Usage:
 *   node scripts/generate-cv.js [--output <path>] [--markdown <path>] [--session <name>]
 *
 * Options:
 *   --output <path>     Output PDF path (default: .browser-profile/cv-polished-<timestamp>.pdf)
 *   --markdown <path>   Read Markdown from file instead of DB
 *   --session <name>    Browser session name (default: "default")
 *
 * Output:
 *   Prints the PDF path to stdout on success.
 *
 * Requirements:
 *   - playwright-cli must be installed and on PATH
 *   - scripts/browser.js wrapper for browser open/close/exec
 *   - scripts/db.js for DB access (reading cv_markdown, writing cv_path)
 *
 * No npm dependencies — the Markdown parser is inline.
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  openBrowser,
  evalJS,
  browser,
  ensure,
} = require('../lib/browser-helpers');

const REPO_ROOT = path.resolve(__dirname, '..');
const DB_JS = path.join(REPO_ROOT, 'scripts', 'db.js');
const BROWSER_JS = path.join(REPO_ROOT, 'scripts', 'browser.js');
const PROFILE_DIR = path.join(REPO_ROOT, '.browser-profile');

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    output: null,
    markdown: null,
    session: 'default',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' || arg === '--output=') {
      if (arg.includes('=')) {
        opts.output = arg.split('=')[1];
      } else {
        opts.output = argv[++i];
      }
    } else if (arg.startsWith('--output=')) {
      opts.output = arg.slice('--output='.length);
    } else if (arg === '--markdown') {
      opts.markdown = argv[++i];
    } else if (arg.startsWith('--markdown=')) {
      opts.markdown = arg.slice('--markdown='.length);
    } else if (arg === '--session') {
      opts.session = argv[++i];
    } else if (arg.startsWith('--session=')) {
      opts.session = arg.slice('--session='.length);
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-cv.js [--output <path>] [--markdown <path>] [--session <name>]

Options:
  --output <path>     Output PDF path (default: .browser-profile/cv-polished-<timestamp>.pdf)
  --markdown <path>   Read Markdown from file instead of DB
  --session <name>    Browser session name (default: "default")
  -h, --help          Show this help`);
}

// ---------------------------------------------------------------------------
// Markdown retrieval
// ---------------------------------------------------------------------------

/**
 * Read CV Markdown from the database (users.data.cv_markdown for user id=1).
 * Uses scripts/db.js via execSync.
 * @returns {string|null} Markdown content or null if not found.
 */
function getMarkdownFromDB() {
  try {
    const sql = "SELECT data->'cv_markdown' AS md FROM users WHERE id = 1";
    const raw = execSync(`node "${DB_JS}" "${sql}"`, {
      encoding: 'utf8',
      timeout: 15000,
      cwd: REPO_ROOT,
    });
    const rows = JSON.parse(raw);
    if (Array.isArray(rows) && rows.length > 0 && rows[0].md) {
      return rows[0].md;
    }
    return null;
  } catch (e) {
    console.error(`[generate-cv] Warning: could not read cv_markdown from DB: ${e.message}`);
    return null;
  }
}

/**
 * Read CV Markdown from a file.
 * @param {string} filePath - Path to the Markdown file.
 * @returns {string|null} Markdown content or null on error.
 */
function getMarkdownFromFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`[generate-cv] Error reading markdown file: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal Markdown to HTML parser (no dependencies)
// ---------------------------------------------------------------------------

/**
 * Escape HTML special characters in text.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Inline formatting: bold (**text**), italic (*text*), and links [text](url).
 * Applied after HTML escaping so injected tags are intentional.
 * @param {string} text - Already HTML-escaped text.
 * @returns {string}
 */
function inlineFormat(text) {
  // Links: [text](url) — process before italic so * inside links isn't mangled
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${url}">${label}</a>`;
  });
  // Bold: **text**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* (but not ** which is bold)
  text = text.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return text;
}

/**
 * Convert a Markdown string to HTML.
 * Handles: #, ##, ### headers; - and * bullet lists; **bold**; *italic*;
 * [text](url) links; and paragraph text.
 *
 * @param {string} md - Markdown source.
 * @returns {string} HTML body content (without <html> wrapper).
 */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const html = [];
  let inList = false;
  let paragraphBuffer = [];

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim();
      if (text) {
        html.push(`<p>${inlineFormat(escapeHtml(text))}</p>`);
      }
      paragraphBuffer = [];
    }
  }

  function closeList() {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — flush current paragraph / list
    if (trimmed === '') {
      flushParagraph();
      closeList();
      continue;
    }

    // Headers: #, ##, ###
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      flushParagraph();
      closeList();
      const level = headerMatch[1].length;
      const content = inlineFormat(escapeHtml(headerMatch[2]));
      html.push(`<h${level}>${content}</h${level}>`);
      continue;
    }

    // Bullet list items: - or * followed by space
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      const content = inlineFormat(escapeHtml(bulletMatch[1]));
      html.push(`<li>${content}</li>`);
      continue;
    }

    // Regular text line — accumulate into paragraph
    closeList();
    paragraphBuffer.push(trimmed);
  }

  // Flush remaining content
  flushParagraph();
  closeList();

  return html.join('\n');
}

// ---------------------------------------------------------------------------
// HTML template with professional CV CSS
// ---------------------------------------------------------------------------

/**
 * Build the full HTML document with embedded CSS for a clean CV layout.
 * @param {string} bodyHtml - HTML body content from markdownToHtml().
 * @returns {string} Complete HTML document.
 */
function buildHtmlDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CV</title>
<style>
  /* --- Base reset --- */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  /* --- Page setup --- */
  @page {
    size: A4;
    margin: 1.5cm;
  }

  html {
    font-size: 11pt;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #222;
    max-width: 100%;
    padding: 0;
  }

  /* --- Header: name (h1) + title (first h2) --- */
  h1 {
    font-size: 20pt;
    font-weight: bold;
    color: #1a1a1a;
    margin-bottom: 2pt;
    border: none;
    padding: 0;
  }

  /* The first h2 right after h1 is the professional title */
  h1 + h2 {
    font-size: 12pt;
    font-weight: normal;
    color: #555;
    margin-bottom: 12pt;
    border: none;
    padding: 0;
  }

  /* --- Section headers (h2 after the title) --- */
  h2 {
    font-size: 12pt;
    font-weight: bold;
    color: #1a1a1a;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    margin-top: 14pt;
    margin-bottom: 6pt;
    padding-bottom: 2pt;
    border-bottom: 1pt solid #999;
  }

  /* --- Sub-section headers (h3) --- */
  h3 {
    font-size: 11pt;
    font-weight: bold;
    color: #333;
    margin-top: 8pt;
    margin-bottom: 2pt;
  }

  /* --- Paragraphs --- */
  p {
    margin-bottom: 4pt;
  }

  /* --- Bullet lists with hanging indent --- */
  ul {
    list-style: disc;
    margin-left: 0;
    padding-left: 18pt;
    margin-bottom: 6pt;
  }

  li {
    margin-bottom: 2pt;
    text-indent: 0;
    hanging-indent: 18pt;
  }

  /* --- Links --- */
  a {
    color: #1a1a1a;
    text-decoration: none;
  }

  /* --- Skills section: compact 2-column layout --- */
  /* Detect skills section by h2 containing "skill" (case-insensitive) */
  /* Uses CSS sibling selector to target the list after a Skills h2 */
  h2:has-text("skill") + ul,
  h2[data-section="skills"] + ul {
    column-count: 2;
    column-gap: 20pt;
    font-size: 10.5pt;
  }

  /* Fallback: apply 2-column to any ul that directly follows an h2
     containing "Skills" — handled via JS class injection at render time */

  /* --- Strong / emphasis --- */
  strong {
    font-weight: bold;
  }

  em {
    font-style: italic;
  }

  /* --- Print optimization --- */
  @media print {
    body {
      font-size: 11pt;
    }

    /* Avoid breaking inside list items and section headers */
    li, h2, h3 {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Keep section header with following content */
    h2 {
      page-break-after: avoid;
      break-after: avoid;
    }

    h1 {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Links should not show URL in print (ATS-friendly) */
    a {
      color: #222;
      text-decoration: none;
    }

    /* No images, no backgrounds — clean text only */
    img {
      display: none;
    }
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF generation via headless browser
// ---------------------------------------------------------------------------

/**
 * Generate a PDF from an HTML file using the headless browser.
 * Opens the browser, waits for render, exports to PDF, closes the session.
 *
 * @param {string} htmlPath - Path to the temp HTML file.
 * @param {string} outputPath - Path for the output PDF.
 * @param {string} session - Browser session name.
 * @returns {boolean} true on success.
 */
function generatePdfFromHtml(htmlPath, outputPath, session) {
  const fileUrl = `file://${htmlPath}`;

  // Step 1: Open browser headless to the HTML file
  console.error(`[generate-cv] Opening browser: ${fileUrl}`);
  openBrowser(fileUrl, { headless: true, session });

  // Step 2: Wait for the page to finish rendering
  console.error('[generate-cv] Waiting for page render...');
  const ready = evalJS('document.readyState', { session });
  if (ready !== 'complete') {
    // Poll a few times if not immediately complete
    let attempts = 0;
    let state = ready;
    while (state !== 'complete' && attempts < 10) {
      state = evalJS('document.readyState', { session });
      attempts++;
    }
    if (state !== 'complete') {
      console.error(`[generate-cv] Warning: document.readyState is "${state}", proceeding anyway.`);
    }
  }

  // Step 3: Inject JS to mark Skills sections for 2-column layout
  // (CSS :has-text() is not standard; we add a data attribute via JS)
  evalJS(`
    (function() {
      var h2s = document.querySelectorAll('h2');
      for (var i = 0; i < h2s.length; i++) {
        var text = h2s[i].textContent.toLowerCase();
        if (text.indexOf('skill') !== -1) {
          h2s[i].setAttribute('data-section', 'skills');
          var next = h2s[i].nextElementSibling;
          if (next && next.tagName === 'UL') {
            next.style.columnCount = '2';
            next.style.columnGap = '20pt';
            next.style.fontSize = '10.5pt';
          }
        }
      }
      return 'done';
    })()
  `, { session });

  // Step 4: Export to PDF via playwright-cli (through browser.js exec)
  console.error(`[generate-cv] Exporting PDF to: ${outputPath}`);
  const pdfResult = browser(`exec pdf "${outputPath}" --session ${session}`, 30000);

  // Check if PDF was created
  if (!fs.existsSync(outputPath)) {
    // Fallback: try playwright-cli directly with session flag
    console.error('[generate-cv] PDF not found after exec, trying playwright-cli directly...');
    try {
      execSync(`playwright-cli -s=${session} pdf "${outputPath}"`, {
        encoding: 'utf8',
        timeout: 30000,
        cwd: REPO_ROOT,
      });
    } catch (e) {
      console.error(`[generate-cv] playwright-cli pdf failed: ${e.message}`);
    }
  }

  return fs.existsSync(outputPath);
}

// ---------------------------------------------------------------------------
// DB update
// ---------------------------------------------------------------------------

/**
 * Update users.data.cv_path with the new PDF path.
 * @param {string} pdfPath - The absolute path to the generated PDF.
 */
function updateCvPathInDB(pdfPath) {
  try {
    const escapedPath = pdfPath.replace(/'/g, "''");
    const sql = `UPDATE users SET data = jsonb_set(data, '{cv_path}', '"${escapedPath}"') WHERE id = 1`;
    execSync(`node "${DB_JS}" "${sql}" --write`, {
      encoding: 'utf8',
      timeout: 15000,
      cwd: REPO_ROOT,
    });
    console.error(`[generate-cv] Updated users.data.cv_path in DB`);
  } catch (e) {
    console.error(`[generate-cv] Warning: could not update cv_path in DB: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // --- Determine output path ---
  const timestamp = Date.now();
  const outputPath = opts.output
    ? path.resolve(opts.output)
    : path.join(PROFILE_DIR, `cv-polished-${timestamp}.pdf`);

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // --- Get Markdown content ---
  let markdown = null;
  if (opts.markdown) {
    console.error(`[generate-cv] Reading Markdown from file: ${opts.markdown}`);
    markdown = getMarkdownFromFile(opts.markdown);
  } else {
    console.error('[generate-cv] Reading cv_markdown from DB...');
    markdown = getMarkdownFromDB();
  }

  if (!markdown || markdown.trim() === '') {
    console.error(
      'No CV Markdown found. Run the polish flow first or provide --markdown.'
    );
    process.exit(1);
  }

  // --- Convert Markdown to HTML ---
  console.error('[generate-cv] Converting Markdown to HTML...');
  const bodyHtml = markdownToHtml(markdown);
  const htmlDoc = buildHtmlDocument(bodyHtml);

  // --- Write HTML to temp file ---
  const tempHtmlPath = path.join('/tmp', `cv-${timestamp}.html`);
  fs.writeFileSync(tempHtmlPath, htmlDoc, 'utf8');
  console.error(`[generate-cv] Wrote temp HTML: ${tempHtmlPath}`);

  // --- Generate PDF ---
  let success = false;
  try {
    success = generatePdfFromHtml(tempHtmlPath, outputPath, opts.session);
  } catch (e) {
    console.error(`[generate-cv] Error during PDF generation: ${e.message}`);
  }

  // --- Close browser session ---
  console.error('[generate-cv] Closing browser session...');
  try {
    browser(`close --session ${opts.session}`, 10000);
  } catch (e) {
    // Best effort — don't fail if close fails
    console.error(`[generate-cv] Warning: could not close browser session: ${e.message}`);
  }

  // --- Clean up temp HTML ---
  try {
    fs.unlinkSync(tempHtmlPath);
    console.error(`[generate-cv] Cleaned up temp HTML: ${tempHtmlPath}`);
  } catch {
    // Best effort
  }

  // --- Check result ---
  if (!success || !fs.existsSync(outputPath)) {
    console.error(`[generate-cv] PDF generation failed. Output not found at: ${outputPath}`);
    process.exit(1);
  }

  // --- Update DB with new CV path ---
  updateCvPathInDB(outputPath);

  // --- Output the PDF path to stdout ---
  console.log(outputPath);
}

main();

import './env.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { fetchAllFeeds } from './fetch.js';
import { summarizeAll } from './summarize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');
const MD_FILE = join(OUTPUT_DIR, 'daily.md');
const HTML_FILE = join(OUTPUT_DIR, 'daily.html');

const PLACEHOLDER = '_Summary unavailable._';

function formatDate(now) {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildMarkdown(results, now, dateStr) {
  const lines = [
    `# AI News Digest — ${dateStr}`,
    ``,
    `_Generated at ${now.toISOString()} · ${results.length} articles_`,
    ``,
    `---`,
    ``,
  ];

  for (const { article, summary } of results) {
    const title = article.link ? `[${article.title}](${article.link})` : article.title;
    lines.push(`## ${title}`);
    lines.push(`**Source:** ${article.source}`);
    lines.push(``);
    lines.push(summary);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}

// Wrap the rendered markdown in a minimal, email-client-friendly HTML shell.
function buildHtml(markdown, dateStr) {
  const body = marked.parse(markdown);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI News Digest — ${dateStr}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         max-width: 720px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55; }
  h1 { font-size: 22px; } h2 { font-size: 18px; margin-top: 28px; }
  a { color: #1a56db; text-decoration: none; } a:hover { text-decoration: underline; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  ul { padding-left: 20px; } em { color: #6b7280; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      'Error: GEMINI_API_KEY is not set.\n' +
        'Get a free key at https://aistudio.google.com/apikey, then add it to .env'
    );
    process.exit(1);
  }

  console.log('Fetching news feeds...');
  const articles = await fetchAllFeeds();
  console.log(`\nFetched ${articles.length} articles total.\n`);

  if (articles.length === 0) {
    console.error('No articles fetched. Check your internet connection and RSS URLs.');
    process.exit(1);
  }

  console.log(`Summarizing ${articles.length} articles with Gemini (single request)...`);
  let summaries;
  try {
    summaries = await summarizeAll(articles);
    const ok = summaries.filter((s) => s !== PLACEHOLDER).length;
    console.log(`  ✓ ${ok}/${articles.length} summarized\n`);
  } catch (err) {
    // Don't crash the whole run — still produce a (placeholder) report.
    console.error(`  ✗ ${err.message}\n`);
    summaries = articles.map(() => PLACEHOLDER);
  }

  const results = articles.map((article, i) => ({ article, summary: summaries[i] }));

  const now = new Date();
  const dateStr = formatDate(now);
  const markdown = buildMarkdown(results, now, dateStr);
  const html = buildHtml(markdown, dateStr);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(MD_FILE, markdown, 'utf-8');
  writeFileSync(HTML_FILE, html, 'utf-8');

  console.log('Done! Wrote output/daily.md and output/daily.html');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

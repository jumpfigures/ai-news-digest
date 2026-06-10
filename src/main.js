import './env.js';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchAllFeeds, fetchResearch, fetchTicker } from './fetch.js';
import { summarizeAll } from './summarize.js';
import { formatDate, buildMarkdown, buildHtml } from './render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'output');
const MD_FILE = join(OUTPUT_DIR, 'daily.md');
const HTML_FILE = join(OUTPUT_DIR, 'daily.html');

const PLACEHOLDER = '_Summary unavailable._';

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

  console.log(`Summarizing ${articles.length} articles with Gemini...`);
  let summaries;
  try {
    summaries = await summarizeAll(articles);
    const ok = summaries.filter((s) => s.summary !== PLACEHOLDER).length;
    console.log(`  ✓ ${ok}/${articles.length} summarized\n`);
  } catch (err) {
    // Don't crash the whole run — still produce a (placeholder) report.
    console.error(`  ✗ ${err.message}\n`);
    summaries = articles.map(() => ({ summary: PLACEHOLDER, category: 'World' }));
  }

  const results = articles.map((article, i) => ({
    article,
    summary: summaries[i].summary,
    category: summaries[i].category,
  }));

  const [research, ticker] = await Promise.all([fetchResearch(), fetchTicker()]);

  const now = new Date();
  const dateStr = formatDate(now);
  const markdown = buildMarkdown(results, now, dateStr);
  const html = buildHtml(results, now, dateStr, research, ticker);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(MD_FILE, markdown, 'utf-8');
  writeFileSync(HTML_FILE, html, 'utf-8');

  console.log('Done! Wrote output/daily.md and output/daily.html');
}

main()
  // Force a clean exit. The HTTP client can keep a keep-alive socket open after
  // the work is done, which otherwise leaves the process hanging (e.g. in CI).
  // All output is written synchronously above, so exiting here is safe.
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });

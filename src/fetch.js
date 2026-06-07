import Parser from 'rss-parser';

const parser = new Parser();

const FEEDS = [
  {
    name: 'CNBC',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  },
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
  },
];

const MAX_ARTICLES_PER_FEED = 5;
const MAX_SNIPPET_LENGTH = 600;

function extractSnippet(item) {
  const raw =
    item.contentSnippet ||
    item.content ||
    item.summary ||
    item.description ||
    '';
  return raw.replace(/<[^>]+>/g, '').trim().slice(0, MAX_SNIPPET_LENGTH) || 'No content available.';
}

export async function fetchAllFeeds() {
  const articles = [];

  for (const feed of FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items.slice(0, MAX_ARTICLES_PER_FEED);

      for (const item of items) {
        articles.push({
          source: feed.name,
          title: item.title?.trim() || 'Untitled',
          content: extractSnippet(item),
          link: item.link || item.guid || '',
        });
      }

      console.log(`  ✓ ${feed.name}: ${items.length} articles`);
    } catch (err) {
      console.error(`  ✗ ${feed.name}: ${err.message}`);
    }
  }

  return articles;
}

import Parser from 'rss-parser';

const parser = new Parser({ timeout: 15000 }); // bound each feed fetch to 15s

const FEEDS = [
  { name: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'WSJ Markets', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  // Reuters & Bloomberg shut down their public RSS, so we pull recent headlines
  // via Google News. Caveat: links route through news.google.com and the
  // snippets are short (Gemini summarizes mostly from the headline for these).
  {
    name: 'Reuters',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Bloomberg',
    url: 'https://news.google.com/rss/search?q=site:bloomberg.com+when:1d&hl=en-US&gl=US&ceid=US:en',
  },
  { name: 'MarketWatch', url: 'http://feeds.marketwatch.com/marketwatch/topstories/' },
];

const MAX_ARTICLES_PER_FEED = 3;
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

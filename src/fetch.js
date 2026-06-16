import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 15000, // bound each feed fetch to 15s
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

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
  { name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/' },
  // ---- Commodities: energy, metals, and agricultural/soft commodities ----
  { name: 'OilPrice', url: 'https://oilprice.com/rss/main' }, // crude, fuels, natural gas, energy
  { name: 'Mining.com', url: 'https://www.mining.com/feed/' }, // gold, silver, copper, base metals, mining
  // Broad cross-commodity headlines (precious + base metals, energy, grains, softs)
  // via Google News so coverage spans the whole complex, not just energy/metals.
  {
    name: 'Commodities',
    url:
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent(
        '(commodity OR "crude oil" OR OPEC OR "natural gas" OR gold OR silver OR copper OR ' +
          'aluminum OR wheat OR corn OR soybean OR coffee OR sugar OR cocoa OR cotton) ' +
          '(price OR prices OR futures OR supply OR demand OR output) when:1d'
      ) +
      '&hl=en-US&gl=US&ceid=US:en',
  },
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

// Pull a lead image URL from whatever the feed provides: enclosure, Media RSS
// (media:content / media:thumbnail), or the first <img> in the HTML content.
function extractImage(item) {
  const enc = item.enclosure;
  if (enc?.url && /^https?:\/\//i.test(enc.url) && (!enc.type || /^image\//i.test(enc.type))) {
    return enc.url;
  }

  const pick = (field) => {
    if (!field) return '';
    const list = Array.isArray(field) ? field : [field];
    for (const m of list) {
      const a = m?.$;
      if (a?.url && (!a.medium || a.medium === 'image') && (!a.type || /^image\//i.test(a.type))) {
        return a.url;
      }
    }
    return '';
  };
  const media = pick(item.mediaContent) || pick(item.mediaThumbnail);
  if (media) return media;

  const html = item.contentEncoded || item.content || item.summary || item.description || '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m && /^https?:\/\//i.test(m[1])) return m[1];

  return '';
}

// Fetch the article page once and pull both the lead image (og:image) and the
// main body text. The text is NOT republished verbatim — it is only fed to
// Gemini so the in-page reader can show a comprehensive brief in our own words.
// Bounded by a timeout and always fails soft.
async function fetchArticlePage(url, timeoutMs = 9000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JumpfiguresBot/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) return { image: '', text: '' };
    const html = await res.text();

    const m =
      html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const image = m && /^https?:\/\//i.test(m[1]) ? m[1] : '';

    // Main text: prefer paragraphs inside <article>, else all paragraphs.
    const scope = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((p) =>
        p[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;|&#160;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&#?\w+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((t) => t.length > 60); // skip boilerplate, captions, nav scraps
    let text = paras.join('\n\n');
    if (text.length < 400) text = ''; // too little to be the real article body
    if (text.length > 4500) text = text.slice(0, 4500);
    return { image, text };
  } catch {
    return { image: '', text: '' };
  }
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
          image: extractImage(item),
          date: item.isoDate || item.pubDate || '', // publication timestamp (ISO)
          fulltext: '',
        });
      }

      console.log(`  ✓ ${feed.name}: ${items.length} articles`);
    } catch (err) {
      console.error(`  ✗ ${feed.name}: ${err.message}`);
    }
  }

  // Enrich every direct-link article from its page, in parallel: lead image
  // (og:image) + main body text for the AI brief. Skip Google News links
  // (Reuters/Bloomberg) — they're redirects, not articles.
  const enrich = articles.filter((a) => a.link && !a.link.includes('news.google.com'));
  if (enrich.length) {
    await Promise.allSettled(
      enrich.map(async (a) => {
        const page = await fetchArticlePage(a.link);
        if (!a.image) a.image = page.image;
        a.fulltext = page.text;
      })
    );
    const gotImg = enrich.filter((a) => a.image).length;
    const gotTxt = enrich.filter((a) => a.fulltext).length;
    console.log(`  + enriched from article pages: ${gotImg} images, ${gotTxt} full texts`);
  }

  return articles;
}

// Real institutional market commentary, pulled from Google News. Banks' own
// research is paywalled and can't be embedded, so we surface what they're saying
// as reported by the press — real, attributed, and linkable. No fabricated quotes.
const INSTITUTIONS = [
  'Goldman Sachs',
  'JPMorgan',
  'Morgan Stanley',
  'BlackRock',
  'Bank of America',
];

function researchUrl(name) {
  return (
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(
      `"${name}" (markets OR stocks OR outlook OR forecast OR strategist OR "price target" OR economy OR Fed) when:5d`
    ) +
    '&hl=en-US&gl=US&ceid=US:en'
  );
}

// Pull a few recent market calls per institution, then interleave so the panel
// mixes firms instead of being dominated by whoever made the most headlines.
export async function fetchResearch(perInstitution = 2) {
  const lists = await Promise.all(
    INSTITUTIONS.map(async (name) => {
      try {
        const parsed = await parser.parseURL(researchUrl(name));
        return parsed.items.slice(0, perInstitution).map((item) => {
          const raw = item.title?.trim() || 'Untitled';
          const m = raw.match(/\s[-–]\s([^-–]+)$/); // Google News appends " - Outlet"
          return {
            inst: name,
            title: m ? raw.slice(0, m.index).trim() : raw,
            outlet: m ? m[1].trim() : '',
            link: item.link || '',
          };
        });
      } catch {
        return [];
      }
    })
  );

  const out = [];
  for (let i = 0; i < perInstitution; i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

// Ticker prices, fetched server-side (no CORS) from Yahoo Finance. Snapshot taken
// each run; fails soft (an unreachable symbol is simply dropped).
const TICKER_SYMBOLS = [
  { y: '^GSPC', label: 'S&P 500' },
  { y: '^IXIC', label: 'NASDAQ' },
  { y: '^DJI', label: 'DOW' },
  { y: 'GC=F', label: 'GOLD' },
  { y: 'CL=F', label: 'WTI' },
  { y: '^TNX', label: 'US 10Y' },
  { y: 'BTC-USD', label: 'BTC' },
  { y: 'ETH-USD', label: 'ETH' },
];

async function yahooQuote(sym) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
      { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    const m = j?.chart?.result?.[0]?.meta;
    const price = m?.regularMarketPrice;
    const prev = m?.chartPreviousClose ?? m?.previousClose;
    if (typeof price !== 'number' || typeof prev !== 'number' || !prev) return null;
    return { price, changePct: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

export async function fetchTicker() {
  const out = await Promise.all(
    TICKER_SYMBOLS.map(async (s) => {
      const q = await yahooQuote(s.y);
      return q ? { label: s.label, price: q.price, changePct: q.changePct } : null;
    })
  );
  return out.filter(Boolean);
}

// Daily OHLC candles (6-month snapshot) for the MARKET charts, fetched
// server-side from Yahoo Finance and embedded into the page so the custom
// Lightweight Charts can render them with full color control.
const CHART_SYMBOLS = [
  { y: '^GSPC', label: 'INDEX · S&P 500' },
  { y: 'BTC-USD', label: 'CRYPTO · BITCOIN' },
];

async function yahooCandles(sym) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo`,
      { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const ts = r?.timestamp;
    const q = r?.indicators?.quote?.[0];
    if (!Array.isArray(ts) || !q) return [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i];
      const h = q.high?.[i];
      const l = q.low?.[i];
      const c = q.close?.[i];
      if ([o, h, l, c].some((v) => typeof v !== 'number')) continue;
      out.push({ time: new Date(ts[i] * 1000).toISOString().slice(0, 10), open: o, high: h, low: l, close: c });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchCandles() {
  const out = await Promise.all(
    CHART_SYMBOLS.map(async (s) => ({ label: s.label, candles: await yahooCandles(s.y) }))
  );
  return out.filter((x) => x.candles.length);
}

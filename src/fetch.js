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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JumpfigureBot/1.0)' },
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
// each run; fails soft (an unreachable symbol is simply dropped). This list also
// drives the STATISTIC tab (correlation matrix, returns/vol, ranking), so it aims
// to span every major asset class. Grouped by class for a block-readable matrix.
// Where a class trades on a foreign calendar/timezone (intl & EM equity, credit,
// real estate), we use US-listed ETF proxies so every series shares the NYSE
// session — otherwise same-date correlations vs US assets are distorted by the
// close-time offset.
const TICKER_SYMBOLS = [
  // US equity (size/style)
  { y: '^GSPC', label: 'S&P 500', short: 'SPX' },
  { y: '^IXIC', label: 'NASDAQ', short: 'NDX' },
  { y: '^DJI', label: 'DOW', short: 'DJI' },
  { y: '^RUT', label: 'RUSSELL 2000', short: 'RUT' },
  // International & emerging equity (ETF proxies, NYSE hours)
  { y: 'EFA', label: 'MSCI EAFE (DEV. INTL)', short: 'EAFE' },
  { y: 'EEM', label: 'MSCI EMERGING MKTS', short: 'EM' },
  // Rates & credit
  { y: '^TNX', label: 'US 10Y YIELD', short: '10Y' },
  { y: 'TLT', label: 'US 20Y+ TREASURY', short: 'UST' },
  { y: 'LQD', label: 'US IG CREDIT', short: 'IG' },
  { y: 'HYG', label: 'US HIGH YIELD', short: 'HY' },
  // Commodities
  { y: 'GC=F', label: 'GOLD', short: 'XAU' },
  { y: 'SI=F', label: 'SILVER', short: 'XAG' },
  { y: 'CL=F', label: 'WTI CRUDE', short: 'WTI' },
  { y: 'NG=F', label: 'NATURAL GAS', short: 'NGAS' },
  { y: 'HG=F', label: 'COPPER', short: 'COPR' },
  // Currency
  { y: 'DX-Y.NYB', label: 'US DOLLAR INDEX', short: 'USD' },
  // Real estate
  { y: 'VNQ', label: 'US REIT', short: 'REIT' },
  // Volatility
  { y: '^VIX', label: 'VIX', short: 'VIX' },
  // Crypto
  { y: 'BTC-USD', label: 'BITCOIN', short: 'BTC' },
  { y: 'ETH-USD', label: 'ETHEREUM', short: 'ETH' },
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

// ---- Cross-asset statistics for the STATISTIC tab ----------------------------
// Pull 6 months of daily closes for every ticker asset, align them on the trading
// days they all share, and compute daily simple returns. From those we derive a
// Pearson correlation matrix plus each asset's annualized volatility and period
// return. Computed server-side so the page stays a lightweight static artifact.
function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}

function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  const v = a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1);
  return Math.sqrt(v);
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den ? Math.max(-1, Math.min(1, num / den)) : 0;
}

export async function fetchStats() {
  const series = await Promise.all(
    TICKER_SYMBOLS.map(async (s) => ({
      label: s.label,
      short: s.short || s.label,
      candles: await yahooCandles(s.y),
    }))
  );

  // Need at least a month of data per asset to be meaningful.
  const valid = series.filter((x) => x.candles.length > 20);
  if (valid.length < 2) return null;

  // date -> close, per asset.
  const maps = valid.map((v) => {
    const m = new Map();
    for (const c of v.candles) m.set(c.time, c.close);
    return m;
  });

  // Trading days shared by every asset (crypto trades weekends, equities don't),
  // in chronological order.
  let common = [...maps[0].keys()];
  for (let i = 1; i < maps.length; i++) common = common.filter((d) => maps[i].has(d));
  common.sort();
  if (common.length < 5) return null;

  const closes = maps.map((m) => common.map((d) => m.get(d)));
  const returns = closes.map((c) => {
    const r = [];
    for (let i = 1; i < c.length; i++) r.push(c[i - 1] ? (c[i] - c[i - 1]) / c[i - 1] : 0);
    return r;
  });

  const n = valid.length;
  const matrix = [];
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) matrix[i][j] = i === j ? 1 : pearson(returns[i], returns[j]);
  }

  const metrics = valid.map((v, i) => {
    const first = closes[i][0];
    const last = closes[i][closes[i].length - 1];
    return {
      label: v.label,
      short: v.short,
      ret: first ? ((last - first) / first) * 100 : 0, // period % change
      vol: stdev(returns[i]) * Math.sqrt(252) * 100, // annualized %
    };
  });

  return {
    assets: valid.map((v) => ({ label: v.label, short: v.short })),
    matrix,
    metrics,
    days: common.length,
    since: common[0],
    until: common[common.length - 1],
  };
}

// Stablecoins and wrapped/staked/derivative tokens are excluded from the live
// crypto correlation matrix: stables barely move (near-zero, meaningless r) and
// wrapped/staked assets track their underlying ~1.0, which just duplicates rows.
const CRYPTO_STABLE = new Set([
  'USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDD', 'PYUSD', 'USDP', 'GUSD',
  'FRAX', 'LUSD', 'USD1', 'BUSD', 'USDS', 'USDG', 'EURS', 'EURC', 'USDX', 'BSC-USD',
]);
const CRYPTO_WRAPPED = new Set([
  'WBTC', 'WETH', 'WEETH', 'WSTETH', 'STETH', 'WBETH', 'RETH', 'CBETH', 'BTCB',
  'WBNB', 'SOLVBTC', 'LBTC', 'CLBTC', 'JITOSOL', 'MSOL', 'JUPSOL', 'BNSOL',
  'SUSDE', 'SUSDS', 'RSETH', 'METH', 'WBT',
  // Tokenized gold / RWA — pegged to an external asset, so they track gold (~0
  // with the crypto market), same degenerate-correlation problem as wrapped coins.
  'XAUT', 'PAXG',
]);

async function fetchJson(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve the current top-`limit` cryptocurrencies for the LIVE correlation
// matrix, fresh each build so the set tracks today's market-cap leaders.
// CoinGecko supplies the market-cap ranking; we drop stablecoins and wrapped/
// staked derivatives, then keep only coins that actually have a spot USDT pair on
// Binance (so the browser can stream them via @miniTicker). Returns
// [{ s: 'btcusdt', label: 'BTC' }, ...], or null if either API is unreachable —
// the renderer then falls back to its static list.
export async function fetchCryptoCorr(limit = 20) {
  const [markets, binance] = await Promise.all([
    fetchJson(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd' +
        '&order=market_cap_desc&per_page=100&page=1&sparkline=false'
    ),
    // Public Binance market-data mirror (keyless): 24h stats for every spot symbol.
    fetchJson('https://data-api.binance.vision/api/v3/ticker/24hr'),
  ]);
  if (!Array.isArray(markets) || !Array.isArray(binance)) return null;

  // Keep only USDT pairs liquid enough for a LIVE per-second correlation. The
  // matrix samples last price once a second; a thin coin that trades only a few
  // times a minute (e.g. XMR, ~$0.6M/24h) barely ticks between samples, so its
  // returns are mostly zero and it shows as a meaningless all-0.00 row. Requiring
  // real 24h turnover drops those; the next liquid coin by market cap takes its slot.
  // Low bar: real top-cap coins trade $50M+/day, so this only rejects genuinely
  // dead/thin pairs (XMR was ~$0.6M) while keeping anything that ticks per-second.
  const MIN_24H_QUOTE_VOLUME = 2_000_000; // USDT
  const binanceUsdt = new Set(
    binance
      .filter(
        (t) =>
          t &&
          typeof t.symbol === 'string' &&
          t.symbol.endsWith('USDT') &&
          parseFloat(t.quoteVolume || '0') >= MIN_24H_QUOTE_VOLUME
      )
      .map((t) => t.symbol)
  );

  const out = [];
  const seen = new Set();
  for (const coin of markets) {
    const sym = (coin?.symbol || '').toUpperCase();
    if (!sym || seen.has(sym)) continue;
    if (CRYPTO_STABLE.has(sym) || CRYPTO_WRAPPED.has(sym)) continue;
    const pair = sym + 'USDT';
    if (!binanceUsdt.has(pair)) continue; // no live Binance stream -> skip
    seen.add(sym);
    out.push({ s: pair.toLowerCase(), label: sym });
    if (out.length >= limit) break;
  }
  return out.length >= 2 ? out : null;
}

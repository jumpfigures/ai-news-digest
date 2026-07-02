import { marked } from 'marked';
import { readFileSync } from 'fs';

// Optional real Bloomberg keyboard SVG used as the cover background. Drop your own
// vector at assets/bloomberg-keyboard.svg and it gets inlined; otherwise a built-in
// lightweight keyboard is drawn. Fails soft (missing file → built-in keyboard).
const COVER_KBD_SVG = (() => {
  try {
    return readFileSync(new URL('../assets/bloomberg-keyboard.svg', import.meta.url), 'utf-8')
      .replace(/^[\s\S]*?<svg/i, '<svg');
  } catch {
    return null;
  }
})();

// Optional world-map cover backdrop. Drop assets/cover-map.jpg and it becomes the
// ambient wallpaper behind the boot dashboard (in place of the keyboard). Inlined as
// a data URI so the page stays self-contained. Fails soft (missing file → keyboard).
const COVER_MAP_DATAURI = (() => {
  try {
    const buf = readFileSync(new URL('../assets/cover-map.jpg', import.meta.url));
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

// Optional animated node-atlas backdrop. Drop assets/cover-earth.jpg and the cover
// becomes a live earth map with pulsing financial-hub nodes and slow signal trails
// arcing between them. Takes precedence over the static map. Fails soft.
const COVER_EARTH_DATAURI = (() => {
  try {
    const buf = readFileSync(new URL('../assets/cover-earth.jpg', import.meta.url));
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();

export function formatDate(now) {
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Color-code the field labels like terminal data fields.
function colorFields(html) {
  return html
    .replace(/<strong>Summary<\/strong>/g, '<strong class="f f-sum">SUMMARY</strong>')
    .replace(/<strong>Why It Matters<\/strong>/g, '<strong class="f f-why">WHY IT MATTERS</strong>')
    .replace(/<strong>Market Impact<\/strong>/g, '<strong class="f f-mkt">MARKET IMPACT</strong>');
}

// Live crypto correlation set — Binance combined-stream symbols + display labels.
// These stream 24/7 to the browser (keyless WebSocket), so the crypto matrix can
// be recomputed live every second; the cross-asset matrix stays daily/server-side.
// The real list is resolved fresh each build by fetchCryptoCorr() (current top-20
// by market cap); this static set is only the fallback used when that fetch fails.
const CRYPTO_CORR = [
  { s: 'btcusdt', label: 'BTC' },
  { s: 'ethusdt', label: 'ETH' },
  { s: 'bnbusdt', label: 'BNB' },
  { s: 'solusdt', label: 'SOL' },
  { s: 'xrpusdt', label: 'XRP' },
  { s: 'dogeusdt', label: 'DOGE' },
  { s: 'adausdt', label: 'ADA' },
  { s: 'trxusdt', label: 'TRX' },
  { s: 'avaxusdt', label: 'AVAX' },
  { s: 'linkusdt', label: 'LINK' },
  { s: 'dotusdt', label: 'DOT' },
  { s: 'ltcusdt', label: 'LTC' },
  { s: 'bchusdt', label: 'BCH' },
  { s: 'nearusdt', label: 'NEAR' },
  { s: 'uniusdt', label: 'UNI' },
  { s: 'aptusdt', label: 'APT' },
  { s: 'icpusdt', label: 'ICP' },
  { s: 'filusdt', label: 'FIL' },
  { s: 'etcusdt', label: 'ETC' },
  { s: 'atomusdt', label: 'ATOM' },
];

// Color a correlation cell: green for positive, red for negative co-movement,
// intensity scaled by the strength |r|. Returned as an rgba() string.
function corrColor(r) {
  const a = (0.1 + Math.min(1, Math.abs(r)) * 0.55).toFixed(3);
  return r >= 0 ? `rgba(61,247,107,${a})` : `rgba(255,92,92,${a})`;
}

// Build the inner HTML for the STATISTIC tab: a clickable list (correlation
// matrix / returns-volatility / performance ranking) plus one panel per item.
// All values are precomputed in fetchStats(); this only lays them out.
function buildStatistic(stats, crypto = CRYPTO_CORR) {
  if (!stats || !Array.isArray(stats.assets) || stats.assets.length < 2) {
    return '<div class="statempty">▸ Market statistics unavailable right now.</div>';
  }
  const { assets, matrix, days, since, until } = stats;

  // Correlation matrix — color-coded heatmap table.
  const head = `<tr><th class="corncorner"></th>${assets
    .map((a) => `<th title="${esc(a.label)}">${esc(a.short)}</th>`)
    .join('')}</tr>`;
  const rows = assets
    .map((a, i) => {
      const cells = matrix[i]
        .map((r, j) => {
          const v = r.toFixed(2);
          const diag = i === j ? ' cc-diag' : '';
          return `<td class="cc${diag}" style="background:${corrColor(r)}" title="${esc(a.short)} × ${esc(assets[j].short)}: ${v}">${v}</td>`;
        })
        .join('');
      return `<tr><th title="${esc(a.label)}">${esc(a.short)}</th>${cells}</tr>`;
    })
    .join('');
  const corrKey = `<div class="corrkey"><span class="ck"><i style="background:${corrColor(-0.85)}"></i>NEGATIVE</span><span class="ck"><i style="background:${corrColor(0.04)}"></i>NONE</span><span class="ck"><i style="background:${corrColor(0.85)}"></i>POSITIVE</span></div>`;

  // Live crypto matrix skeleton — cells carry data-i/data-j so the browser can
  // repaint them each second from the Binance stream. Diagonal starts at 1.00.
  const cHead = `<tr><th class="corncorner"></th>${crypto.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr>`;
  const cRows = crypto.map((c, i) => {
    const cs = crypto.map((_, j) => {
      const diag = i === j ? ' cc-diag' : '';
      const bg = i === j ? ` style="background:${corrColor(1)}"` : '';
      return `<td class="cc${diag}" data-i="${i}" data-j="${j}"${bg}>${i === j ? '1.00' : '·'}</td>`;
    }).join('');
    return `<tr><th>${esc(c.label)}</th>${cs}</tr>`;
  }).join('');

  const corrPanel = `<div class="statpanel" data-stat="corr">
        <div class="corrtoggle">
          <button class="corrtab active" data-corr="asset" type="button">CROSS-ASSET · DAILY</button>
          <button class="corrtab" data-corr="crypto" type="button"><span class="livedot"></span>CRYPTO · LIVE</button>
        </div>
        <div class="corrsub" data-corr="asset">
          <div class="corrwrap"><table class="corrtable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
          ${corrKey}
        </div>
        <div class="corrsub" data-corr="crypto" hidden>
          <div class="livestat" id="cryptoStatus">▸ CONNECTING TO LIVE FEED…</div>
          <div class="corrwrap"><table class="corrtable" id="cryptoTable"><thead>${cHead}</thead><tbody>${cRows}</tbody></table></div>
          ${corrKey}
        </div>
      </div>`;

  const meta = `<div class="statmeta">▸ ${days} TRADING DAYS · ${esc(since)} → ${esc(until)} · DAILY RETURNS · SOURCE: YAHOO FINANCE</div>`;

  return meta + corrPanel;
}

// Flat markdown report — used for output/daily.md (and the email attachment).
export function buildMarkdown(results, now, dateStr) {
  const lines = [
    `# Jumpfigure — ${dateStr}`,
    ``,
    `_Generated at ${now.toISOString()} · ${results.length} articles_`,
    ``,
    `---`,
    ``,
  ];

  for (const { article, summary, category } of results) {
    const title = article.link ? `[${article.title}](${article.link})` : article.title;
    lines.push(`## ${title}`);
    lines.push(`**Source:** ${article.source} · **Category:** ${category || 'World'}`);
    lines.push(``);
    lines.push(summary);
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}

// Bloomberg-Terminal-style HTML page with per-source tabs.
// Progressive enhancement: the tab bar is hidden by default and revealed by JS,
// so email clients (no JS) just show every article, while the website (JS) gets
// clickable source tabs that filter the feed.
export function buildHtml(results, now, dateStr, research = [], ticker = [], stats = null, crypto = CRYPTO_CORR) {
  // Live crypto correlation set (top-N by market cap, resolved at build time);
  // fall back to the static list if the fetch came back empty/unusable.
  const cryptoList = Array.isArray(crypto) && crypto.length >= 2 ? crypto : CRYPTO_CORR;
  // Sources in first-seen order, with counts.
  const order = [];
  const counts = {};
  for (const { article } of results) {
    if (!(article.source in counts)) {
      counts[article.source] = 0;
      order.push(article.source);
    }
    counts[article.source]++;
  }

  // Categories present (fixed preferred order first, then any extras), with counts.
  const CAT_ORDER = ['Markets', 'Commodities', 'Economy', 'Politics', 'Technology', 'Biotechnology', 'Crypto', 'Business', 'World'];
  const catCounts = {};
  for (const { category } of results) {
    const c = category || 'World';
    catCounts[c] = (catCounts[c] || 0) + 1;
  }
  const cats = CAT_ORDER.filter((c) => catCounts[c]);
  for (const c of Object.keys(catCounts)) if (!cats.includes(c)) cats.push(c);

  const items = [
    `<li class="newsitem active" data-cat="ALL">ALL NEWS <i>${results.length}</i></li>`,
    ...cats.map(
      (c) =>
        `<li class="newsitem" data-cat="${esc(c)}">${esc(c.toUpperCase())} <i>${catCounts[c]}</i></li>`
    ),
  ].join('');

  // Bloomberg-style timestamp for a story, in WIB: "15 JUN · 14:32".
  const fmtNewsDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const date = d
      .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' })
      .toUpperCase();
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    return `${date} · ${time}`;
  };

  const cards = results
    .map(({ article, summary, category, brief }) => {
      const cat = category || 'World';
      const title = article.link
        ? `<a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a>`
        : esc(article.title);
      const img = article.image
        ? `<img class="thumb" src="${esc(article.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : '';
      const summaryHtml = colorFields(marked.parse(summary));
      // Full own-words brief, hidden in the card; the in-page reader displays it.
      const briefHtml = brief ? `<div class="fullbrief" hidden>${marked.parse(brief)}</div>` : '';
      const dateStamp = fmtNewsDate(article.date);
      return `      <article class="card" data-cat="${esc(cat)}">
        <h2>${title}</h2>
        <div class="srcline"><span class="f f-cat">${esc(cat.toUpperCase())}</span> <span class="srcname"><span class="f f-src">SRC</span> ${esc(article.source)}</span>${dateStamp ? `<time class="f-date">${dateStamp}</time>` : ''}</div>
        ${img}
        <div class="summary">${summaryHtml}</div>
        ${briefHtml}
      </article>`;
    })
    .join('\n');

  const fmtPrice = (n) =>
    n >= 1000
      ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 });
  const tickerItems = ticker
    .map((t) => {
      const up = t.changePct >= 0;
      return `<span class="tk"><span class="tsym">${esc(t.label)}</span> <span class="tpx">${fmtPrice(t.price)}</span> <span class="${up ? 'up' : 'dn'}">${up ? '▲' : '▼'}${Math.abs(t.changePct).toFixed(2)}%</span></span>`;
    })
    .join('');
  const tickerHtml = tickerItems ? tickerItems + tickerItems : ''; // duplicate for seamless loop

  const researchHtml = research.length
    ? research
        .map((r) => {
          const t = r.link
            ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a>`
            : esc(r.title);
          const inst = r.inst ? `<span class="rinst">${esc(r.inst.toUpperCase())}</span>` : '';
          const outlet = r.outlet ? `<span class="routlet">via ${esc(r.outlet)}</span>` : '';
          return `<div class="rcard">${inst}${t}${outlet}</div>`;
        })
        .join('\n')
    : '<div class="routlet">No institutional commentary found right now.</div>';

  // STATISTIC tab: cross-asset correlation matrix + returns/volatility + ranking.
  const statisticHtml = buildStatistic(stats, cryptoList);

  // Real headlines scrolling across the cover's bottom ticker (duplicated for a seamless loop).
  const covHead = results.length
    ? results
        .slice(0, 16)
        .map((r) => `<span class="th">▸ ${esc(r.article.title)}</span>`)
        .join('')
    : '<span class="th">▸ Awaiting market headlines…</span>';
  const covTape = covHead + covHead;

  // Cover background: dark vignette so the keyboard backdrop pops.
  const coverBgCss = `radial-gradient(ellipse 92% 82% at 50% 44%, #14120c 0%, #0a0906 52%, #050403 100%)`;

  // Bloomberg-style keyboard backdrop — authentic palette/layout (grey body, yellow
  // sector keys, green action keys, red CANCEL, blue HELP, green <GO>), drawn as a
  // lightweight vector so it doesn't bloat the auto-refreshing page or the email.
  const covKbdFallback = (() => {
    const W = 1000, M = 34, keyH = 54, rowGap = 12;
    const rowDefs = [
      { n: 11, base: 'k-yellow', labels: ['GOVT', 'CORP', 'MTGE', 'M-MKT', 'MUNI', 'PFD', 'EQUITY', 'CMDTY', 'INDEX', 'CRNCY', 'CLIENT'] },
      { n: 14, base: 'k-dk', labels: ['HELP', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PRT', 'CNCL'] },
      { n: 13, base: 'k-dk', labels: ['MENU', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'MSG', 'GO'] },
      { n: 12, base: 'k-dk', labels: ['CNCL', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'NEWS', 'ENTER'] },
      { n: 11, base: 'k-dk', labels: ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'GRAB', 'PAGE', 'PRNT', 'SHIFT'] },
    ];
    const accents = {
      0: { 3: 'k-white', 7: 'k-green' },
      1: { 0: 'k-blue', 13: 'k-red' }, // HELP (blue), CANCEL (red)
      2: { 0: 'k-green', 12: 'k-green' },
      3: { 0: 'k-red', 10: 'k-green' },
    };
    const txtCls = (c) => (c === 'k-yellow' || c === 'k-white') ? 'lbl-dark' : (c === 'k-dk' ? 'lbl-light' : 'lbl-on');
    // Key legend that blinks on its own random schedule (staggered, terminal-style).
    const lbl = (cx, cy, cls, text) => {
      if (!text) return '';
      const delay = (Math.random() * 3).toFixed(2);
      const dur = (1.8 + Math.random() * 1.8).toFixed(2);
      return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" class="klbl ${txtCls(cls)}" style="animation-delay:${delay}s;animation-duration:${dur}s">${text}</text>`;
    };
    let keys = '';
    rowDefs.forEach((row, r) => {
      const y = 40 + r * (keyH + rowGap);
      const pitch = (W - 2 * M) / row.n;
      const kw = pitch - 8;
      for (let c = 0; c < row.n; c++) {
        const x = M + c * pitch;
        const cls = (accents[r] && accents[r][c]) || row.base;
        keys += `<rect x="${x.toFixed(1)}" y="${y}" width="${kw.toFixed(1)}" height="${keyH}" rx="6" class="${cls}"/>`;
        keys += lbl(x + kw / 2, y + keyH / 2, cls, (row.labels && row.labels[c]) || '');
      }
    });
    const by = 40 + rowDefs.length * (keyH + rowGap);
    let bx = M, bottom = '';
    const seg = (w, cls, text) => {
      const s = `<rect x="${bx.toFixed(1)}" y="${by}" width="${w}" height="${keyH}" rx="6" class="${cls}"/>` +
        lbl(bx + w / 2, by + keyH / 2, cls, text);
      bx += w + 8;
      return s;
    };
    bottom += seg(86, 'k-dk', 'CTRL') + seg(66, 'k-dk', 'ALT') + seg(66, 'k-dk', 'CODE');
    bottom += `<rect x="${bx.toFixed(1)}" y="${by}" width="340" height="${keyH}" rx="6" class="k-dk"/>`;
    bx += 348;
    bottom += seg(66, 'k-dk', 'CONN');
    const goW = Math.max(150, W - M - bx);
    bottom += `<rect x="${bx.toFixed(1)}" y="${by}" width="${goW.toFixed(1)}" height="${keyH}" rx="6" class="k-go"/>`;
    bottom += `<text x="${(bx + goW / 2).toFixed(1)}" y="${(by + keyH / 2).toFixed(1)}" class="k-golbl klbl">&lt;GO&gt;</text>`;
    const H = by + keyH + 34;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="18" class="k-body"/>${keys}${bottom}</svg>`;
  })();
  // Prefer a real keyboard SVG (assets/bloomberg-keyboard.svg) if the file exists.
  const covKbd = COVER_KBD_SVG || covKbdFallback;
  // Cover backdrop: animated node-atlas if assets/cover-earth.jpg exists, else the
  // static world map, else the keyboard.
  const covBackdrop = COVER_EARTH_DATAURI
    ? `<canvas class="covatlas" id="covatlas"></canvas>`
    : COVER_MAP_DATAURI
      ? `<div class="covmap"><img src="${COVER_MAP_DATAURI}" alt="" /></div>`
      : `<div class="covkbd">${covKbd}</div>`;
  // The 4 geo node pulses belong to the static map; the atlas draws its own nodes.
  const covNodes = COVER_EARTH_DATAURI ? '' : `<div class="covnodes">
      <div class="cnode" style="left:19%;top:33%"><span class="dot"></span><span class="ring" style="animation-delay:0s"></span><span class="clbl">NEW YORK</span></div>
      <div class="cnode" style="left:41%;top:21%"><span class="dot"></span><span class="ring" style="animation-delay:.9s"></span><span class="clbl">LONDON</span></div>
      <div class="cnode" style="left:79%;top:53%"><span class="dot"></span><span class="ring" style="animation-delay:1.6s"></span><span class="clbl">SINGAPORE</span></div>
      <div class="cnode" style="left:90%;top:33%"><span class="dot"></span><span class="ring" style="animation-delay:2.3s"></span><span class="clbl">TOKYO</span></div>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Jumpfigure — ${esc(dateStr)}</title>
<script>document.documentElement.className += ' js';</script>
<style>
  :root {
    --bg:#0a0a0a; --amber:#ffa028; --amber2:#ffc46b; --green:#3df76b;
    --cyan:#3ad0ff; --dim:#9a7b3f; --line:#2a2210;
  }
  * { box-sizing:border-box; }
  body {
    background:var(--bg); color:var(--amber);
    font-family:"Consolas","SF Mono","Roboto Mono","Courier New",monospace;
    font-size:14px; line-height:1.55; margin:0; padding:0 0 calc(60px + env(safe-area-inset-bottom));
  }
  .wrap { max-width:1480px; margin:0 auto; padding:0 18px; }
  .chrome {
    background:var(--amber); color:#000; font-weight:bold;
    display:flex; justify-content:space-between; align-items:center;
    padding:max(6px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 6px max(12px,env(safe-area-inset-left));
    letter-spacing:1px; font-size:12px;
  }
  /* macOS-style window controls: red=close, yellow=minimize, green=full screen.
     Glossy dots with a tonal rim; symbols stay hidden until the group is hovered. */
  .windots { display:inline-flex; align-items:center; gap:8px; vertical-align:middle; }
  .wd {
    width:14px; height:14px; border-radius:50%; border:none; padding:0; margin:0;
    display:inline-flex; align-items:center; justify-content:center;
    font-family:inherit; font-size:10.5px; line-height:1; font-weight:800;
    color:transparent; -webkit-text-stroke:.6px currentColor; text-stroke:.6px currentColor;
    cursor:pointer; -webkit-user-select:none; user-select:none;
    transition:filter .12s ease;
  }
  .wd.d-r { background:radial-gradient(circle at 50% 32%, #ff8b86, #ff5f57 62%); box-shadow:inset 0 0 0 .5px #e0443b; }
  .wd.d-y { background:radial-gradient(circle at 50% 32%, #ffd784, #febc2e 62%); box-shadow:inset 0 0 0 .5px #dfa023; }
  .wd.d-g { background:radial-gradient(circle at 50% 32%, #74e588, #28c840 62%); box-shadow:inset 0 0 0 .5px #1dad2b; }
  /* full-screen square drawn with a border so it stays crisp and perfectly centred */
  .wd.d-g::before { content:""; width:6px; height:6px; box-sizing:border-box;
    border:1.6px solid currentColor; border-radius:1px; }
  .windots:hover .wd { color:rgba(0,0,0,.66); }
  .wd:active { filter:brightness(.92); }
  .covtop .wd { pointer-events:none; } /* decorative on the boot splash (click launches the terminal) */
  /* closed: full-screen "session ended" curtain */
  .closedscreen {
    position:fixed; inset:0; z-index:200; background:#050403; cursor:pointer;
    display:flex; align-items:center; justify-content:center; text-align:center;
    color:var(--amber); letter-spacing:2px; font-size:14px; line-height:2;
  }
  .closedscreen span { color:var(--dim); font-size:12px; letter-spacing:1px; }
  .status {
    border-bottom:1px solid var(--line); color:var(--dim);
    padding:8px 0; font-size:12px; letter-spacing:.5px;
  }
  .status b { color:var(--green); }
  .blink { animation:blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity:0; } }
  h1 {
    color:var(--amber2); font-size:20px; letter-spacing:1px; text-transform:uppercase;
    margin:18px 0 2px; border-left:4px solid var(--amber); padding-left:10px;
  }
  .meta { color:var(--dim); font-size:12px; margin-bottom:6px; }
  /* NEWS category chips — all categories shown in a row (revealed by JS on the website) */
  .newsmenu {
    display:none; position:sticky; top:0; z-index:5; background:var(--bg);
    padding:10px 0; border-bottom:1px solid var(--line); margin-bottom:6px;
  }
  .newslist {
    list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px;
  }
  .newsitem {
    padding:5px 11px; cursor:pointer; color:var(--amber); font-size:11px; font-weight:bold;
    letter-spacing:1px; white-space:nowrap; border:1px solid #4a3a14; border-radius:2px;
    background:#0d0b06; display:inline-flex; align-items:center; gap:7px;
  }
  .newsitem:hover { background:#241c0c; }
  .newsitem.active { background:var(--amber); color:#000; border-color:var(--amber); }
  .newsitem i { font-style:normal; opacity:.6; }
  .newsitem.active i { opacity:.75; }
  /* top section tabs: NEWS / MARKET */
  .sectiontabs { display:none; gap:4px; margin:8px 0 12px; border-bottom:2px solid var(--line); }
  .sectiontab {
    font-family:inherit; font-size:13px; font-weight:bold; letter-spacing:1.5px; cursor:pointer;
    background:transparent; color:var(--dim); border:none; border-bottom:2px solid transparent;
    margin-bottom:-2px; padding:8px 16px;
  }
  .sectiontab:hover { color:var(--amber); }
  .sectiontab.active { color:var(--amber); border-bottom-color:var(--amber); }
  #marketView { padding:6px 0 0; }
  .mkthead { color:var(--amber2); font-size:12px; font-weight:bold; letter-spacing:1.5px; text-transform:uppercase; margin:0 0 10px; display:flex; align-items:center; gap:12px; }
  .mkthead::after { content:""; flex:1; border-top:1px solid var(--line); }
  /* custom Bloomberg-style amber ticker tape */
  .tickerbar { overflow:hidden; white-space:nowrap; border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:#000; padding:7px 0; margin:0 0 14px; }
  .tickertrack { display:inline-block; white-space:nowrap; will-change:transform; animation:tscroll 55s linear infinite; font-size:13px; letter-spacing:.5px; }
  .tickerbar:hover .tickertrack { animation-play-state:paused; }
  @keyframes tscroll { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  .tk { margin:0 26px; }
  .tk .tsym { color:var(--amber); font-weight:bold; }
  .tk .tpx { color:var(--amber2); }
  .tk .up { color:var(--green); }
  .tk .dn { color:#ff5c5c; }
  .tradingview-widget-container { margin-bottom:18px; }
  .chartgrid { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap:16px; }
  .chartcell { border:1px solid var(--line); background:#0c0a06; border-radius:2px; padding:8px 8px 4px; }
  .chartlabel { color:var(--amber2); font-size:12px; font-weight:bold; letter-spacing:1px; margin:2px 0 8px; display:flex; justify-content:space-between; align-items:center; }
  .chartbox { height:520px; width:100%; }
  .mktsec { margin-top:26px; }
  .heatcell { height:680px; overflow:hidden; }
  .heatcell .tradingview-widget-container { height:100%; margin:0; }
  .duo { display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 460px), 1fr)); gap:18px; align-items:start; }
  .panelbox { height:520px; border:1px solid var(--line); background:#0c0a06; border-radius:2px; overflow:hidden; }
  .panelbox .tradingview-widget-container { height:100%; margin:0; }
  .rscroll { overflow-y:auto; padding:2px 14px; }
  .rscroll::-webkit-scrollbar { width:8px; }
  .rscroll::-webkit-scrollbar-track { background:#0c0a06; }
  .rscroll::-webkit-scrollbar-thumb { background:linear-gradient(180deg,var(--amber2),var(--amber) 45%,#b06f12);
    border-radius:5px; box-shadow:0 0 6px rgba(255,160,40,.3); }
  .rcard:last-child { border-bottom:none; }
  /* STATISTIC tab: digest analytics (stat tiles + horizontal bar charts) */
  #statisticView { padding:6px 0 0; }
  .statgrid { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin:4px 0 22px; }
  .stattile { border:1px solid var(--line); background:#0c0a06; border-radius:2px; padding:14px 16px; border-left:3px solid var(--amber); }
  .statbig { color:var(--amber2); font-size:30px; font-weight:bold; letter-spacing:1px; line-height:1; font-variant-numeric:tabular-nums; }
  .statbig.sm { font-size:19px; letter-spacing:.5px; }
  .statcap { color:var(--dim); font-size:10.5px; font-weight:bold; letter-spacing:1.5px; margin-top:8px; }
  .statchart { display:flex; flex-direction:column; gap:9px; padding:2px 2px 6px; }
  .statrow { display:grid; grid-template-columns:132px 1fr 44px; gap:12px; align-items:center; font-size:12px; }
  .statlabel { color:var(--amber); font-weight:bold; letter-spacing:.5px; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .statbarwrap { height:16px; background:#0c0a06; border:1px solid var(--line); border-radius:2px; overflow:hidden; }
  .statbar { display:block; height:100%; min-width:2px; border-radius:1px;
    background:linear-gradient(90deg,var(--amber),var(--amber2)); box-shadow:0 0 10px rgba(255,160,40,.35); }
  .statval { color:var(--amber2); text-align:right; font-variant-numeric:tabular-nums; font-weight:bold; }
  /* STATISTIC sub-list (reuses .newslist/.newsitem chip styling) + section meta */
  .statmenu { margin:2px 0 12px; }
  .statmeta { color:var(--dim); font-size:11px; letter-spacing:1px; margin:0 0 18px; text-transform:uppercase; }
  /* red/green variants for return bars + values (shared by RV + PERF panels) */
  .statbig.up, .statval.up { color:var(--green); }
  .statbig.dn, .statval.dn { color:#ff5c5c; }
  .statbar.up { background:linear-gradient(90deg,var(--green),#9dffbe); box-shadow:0 0 10px rgba(61,247,107,.32); }
  .statbar.dn { background:linear-gradient(90deg,#ff5c5c,#ff9a9a); box-shadow:0 0 10px rgba(255,92,92,.32); }
  .statempty { color:var(--dim); padding:26px 2px; letter-spacing:1px; }
  /* correlation matrix heatmap table */
  /* Terminal-style scrollbars: amber glow on dark, so overflow reads as designed
     rather than default-gray. Global (Firefox via scrollbar-*, Chrome/Safari via
     ::-webkit-scrollbar); the matrix bar below gets a taller, glowier variant. */
  * { scrollbar-width:thin; scrollbar-color:var(--amber) #0c0a06; }
  ::-webkit-scrollbar { width:10px; height:10px; }
  ::-webkit-scrollbar-track { background:#0c0a06; border-radius:6px; box-shadow:inset 0 0 0 1px var(--line); }
  ::-webkit-scrollbar-thumb { background:linear-gradient(180deg,var(--amber2),var(--amber) 45%,#b06f12);
    border:2px solid #0c0a06; border-radius:6px; box-shadow:0 0 6px rgba(255,160,40,.35); }
  ::-webkit-scrollbar-thumb:hover { background:linear-gradient(180deg,#ffd591,var(--amber2) 45%,var(--amber));
    box-shadow:0 0 12px rgba(255,160,40,.75); }
  ::-webkit-scrollbar-corner { background:#0c0a06; }

  .corrwrap { overflow-x:auto; margin:2px 0 16px; padding-bottom:5px; -webkit-overflow-scrolling:touch;
    scrollbar-color:var(--amber) #0c0a06; }
  /* The horizontal matrix bar is the one users drag — make it taller + glowier. */
  .corrwrap::-webkit-scrollbar { height:14px; }
  .corrwrap::-webkit-scrollbar-track { background:#0c0a06; border-radius:8px; box-shadow:inset 0 0 0 1px var(--line); }
  .corrwrap::-webkit-scrollbar-thumb { background:linear-gradient(180deg,var(--amber2),var(--amber) 50%,#a9690f);
    border:3px solid #0c0a06; border-radius:8px; box-shadow:0 0 10px rgba(255,160,40,.5); }
  .corrwrap::-webkit-scrollbar-thumb:hover { background:linear-gradient(180deg,#ffe0ad,var(--amber2) 50%,var(--amber));
    box-shadow:0 0 16px rgba(255,160,40,.85); }
  .corrtable { border-collapse:collapse; font-size:15px; font-variant-numeric:tabular-nums; }
  .corrtable th { color:var(--amber); font-weight:bold; letter-spacing:.5px; padding:7px 12px; text-align:center; background:#0c0a06; white-space:nowrap; }
  .corrtable thead th { border-bottom:1px solid var(--line); }
  .corrtable tbody th { text-align:right; border-right:1px solid var(--line); position:sticky; left:0; z-index:1; }
  .corrtable .corncorner { border-right:1px solid var(--line); border-bottom:1px solid var(--line); position:sticky; left:0; z-index:1; }
  .corrtable td.cc { text-align:center; padding:10px 15px; color:#fff; min-width:62px;
    border:1px solid rgba(0,0,0,.35); text-shadow:0 1px 2px rgba(0,0,0,.6); }
  .corrtable td.cc-diag { color:var(--amber2); font-weight:bold; }
  .corrkey { display:flex; flex-wrap:wrap; gap:16px; color:var(--dim); font-size:10.5px; letter-spacing:1.5px; font-weight:bold; }
  .corrkey .ck { display:inline-flex; align-items:center; gap:6px; }
  .corrkey .ck i { width:14px; height:14px; border-radius:2px; display:inline-block; border:1px solid rgba(0,0,0,.4); }
  /* CROSS-ASSET vs CRYPTO·LIVE toggle inside the correlation panel */
  .corrtoggle { display:flex; gap:6px; margin:0 0 12px; }
  .corrtab { font-family:inherit; font-size:11px; font-weight:bold; letter-spacing:1px; cursor:pointer;
    background:#0d0b06; color:var(--amber); border:1px solid #4a3a14; border-radius:2px; padding:5px 12px;
    display:inline-flex; align-items:center; gap:7px; }
  .corrtab:hover { background:#241c0c; }
  .corrtab.active { background:var(--amber); color:#000; border-color:var(--amber); }
  .corrtab .livedot { width:7px; height:7px; border-radius:50%; background:var(--green); box-shadow:0 0 6px var(--green); animation:covpulse 1.2s infinite; }
  .corrtab.active .livedot { background:#0a5; box-shadow:none; }
  .livestat { color:var(--green); font-size:11px; letter-spacing:1px; margin:0 0 10px; font-weight:bold; font-variant-numeric:tabular-nums; }
  /* in-page article reader (terminal-style modal) */
  .reader { position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:50; display:none; align-items:flex-start; justify-content:center; overflow-y:auto; padding:42px 16px; }
  .reader.open { display:flex; }
  .rpanel { background:#0c0a06; border:1px solid #4a3a14; border-radius:2px; max-width:860px; width:100%; box-shadow:0 0 40px rgba(255,160,40,.07); }
  .rphead { display:flex; justify-content:space-between; align-items:center; background:var(--amber); color:#000; padding:6px 12px; font-weight:bold; letter-spacing:1.5px; font-size:11px; }
  .rpclose { cursor:pointer; background:none; border:none; font:inherit; color:#000; font-weight:bold; letter-spacing:1px; }
  .rpclose:hover { opacity:.7; }
  .rpbody { padding:18px 22px 26px; }
  .rptitle { color:var(--amber2); font-size:19px; line-height:1.45; margin:8px 0 4px; font-weight:bold; }
  .rpmeta { color:var(--dim); font-size:11px; letter-spacing:1px; }
  .rpimg { display:block; width:100%; max-height:380px; object-fit:cover; border:1px solid var(--line); border-radius:2px; margin:12px 0 4px; }
  .rpdivider { border:none; border-top:1px dashed var(--line); margin:14px 0; }
  .rpsrc { display:inline-block; margin-top:18px; background:var(--amber); color:#000; font-weight:bold; padding:8px 16px; border-radius:2px; text-decoration:none; font-size:12px; letter-spacing:1px; }
  .rpsrc:hover { background:var(--amber2); color:#000; }
  h2 a { cursor:pointer; }
  .rcard { border-bottom:1px dashed var(--line); padding:11px 2px; }
  .rinst { display:inline-block; background:var(--amber); color:#000; font-weight:bold; font-size:10px; letter-spacing:1px; padding:1px 6px; border-radius:2px; margin-right:8px; }
  .rcard a { color:var(--amber2); text-decoration:none; font-size:14px; border-bottom:1px dotted #5a4a20; }
  .rcard a:hover { color:#fff; border-color:#fff; }
  .routlet { display:block; color:var(--dim); font-size:11px; margin-top:4px; letter-spacing:1px; text-transform:uppercase; }
  /* News grid: cards fill left-to-right, then wrap to the next row. */
  .feed { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap:18px; align-items:start; }
  /* No boxy outline — a left accent tick + subtle tint, terminal-feed style. */
  .card {
    background:#0c0a06; padding:11px 14px; margin:0;
    border-left:3px solid #3a2e12; border-radius:0 2px 2px 0;
    transition:border-color .15s ease, background .15s ease, box-shadow .15s ease;
    /* skip rendering off-screen cards so a long feed scrolls at full frame rate */
    content-visibility:auto; contain-intrinsic-size:auto 440px;
  }
  .card:hover {
    border-left-color:var(--amber); background:#100c06;
    box-shadow:0 0 0 1px rgba(255,160,40,.08), 0 6px 18px rgba(0,0,0,.35);
  }
  h2 { font-size:15.5px; line-height:1.4; margin:0 0 4px; }
  h2 a { color:var(--amber2); text-decoration:none; border-bottom:1px dotted #5a4a20; }
  h2 a:hover { color:#fff; border-color:#fff; }
  .srcline { color:var(--dim); font-size:11px; margin-bottom:8px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .srcname { display:inline-flex; align-items:center; gap:6px; }
  .f-date { margin-left:auto; color:var(--amber); opacity:.7; font-size:11px; letter-spacing:.5px; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .card img.thumb { display:block; width:100%; height:160px; object-fit:cover; margin:8px 0; border:1px solid var(--line); border-radius:2px; background:#000; }
  em { color:var(--dim); font-style:normal; }
  .f { font-weight:bold; letter-spacing:1px; font-size:11px; }
  .f-src { padding:1px 6px; background:#1c1606; color:var(--amber); border:1px solid #4a3a14; border-radius:2px; }
  .f-cat { padding:1px 6px; background:var(--amber); color:#000; border-radius:2px; margin-right:4px; }
  .f-sum { color:var(--amber); }
  .f-brief { color:var(--amber2); }
  .fullbrief[hidden] { display:none; }
  .rpbrief p { margin:9px 0; line-height:1.65; }
  .f-why { color:var(--cyan); }
  .f-mkt { color:var(--green); }
  ul { list-style:none; padding-left:2px; margin:6px 0; }
  li { padding-left:18px; position:relative; }
  li::before { content:"\\25B8"; position:absolute; left:0; color:var(--amber); }
  a { color:var(--cyan); }
  .empty { color:var(--dim); padding:24px 0; display:none; }
  .foot {
    margin-top:30px; padding-top:12px; border-top:1px solid var(--line);
    color:var(--dim); font-size:11px; letter-spacing:.5px;
  }
  /* ---- intro cover: full Bloomberg-style boot dashboard (website only; revealed
     pre-paint via html.js so email — which ignores the head script — never shows it) ---- */
  .cover { display:none; }
  html.js .cover {
    display:grid; grid-template-rows:auto minmax(0,1fr) auto auto;
    position:fixed; top:0; left:0; width:100%;
    height:100vh; height:100dvh; /* dvh tracks the mobile URL bar so the boot screen centres in the visible area */
    z-index:100; overflow:hidden;
    background:${coverBgCss};
    transition:opacity .7s ease, visibility .7s ease;
  }
  .cover.gone { opacity:0; visibility:hidden; pointer-events:none; }
  .coverfx { position:absolute; inset:0; width:100%; height:100%; z-index:1; opacity:.26; }
  /* stylized Bloomberg-style keyboard (our own SVG, not a copyrighted photo) as an ambient backdrop */
  .covkbd { position:absolute; left:50%; top:52%; transform:translate(-50%,-50%);
    width:min(1500px,132%); z-index:0; pointer-events:none; opacity:.42; }
  .covkbd svg { width:100%; height:auto; display:block; filter:saturate(.55) brightness(.82) drop-shadow(0 18px 50px rgba(0,0,0,.55)); }
  .covkbd .k-body { fill:#3f4040; stroke:#222; stroke-width:2; }
  .covkbd .k-dk { fill:#262626; stroke:#000; stroke-width:1; }
  .covkbd .k-yellow { fill:#fecd00; stroke:#000; stroke-width:1; }
  .covkbd .k-green { fill:#51a121; stroke:#000; stroke-width:1; }
  .covkbd .k-red { fill:#e8002a; stroke:#000; stroke-width:1; }
  .covkbd .k-blue { fill:#00a7e1; stroke:#000; stroke-width:1; }
  .covkbd .k-white { fill:#fff; stroke:#000; stroke-width:1; }
  .covkbd .k-go { fill:#51a121; stroke:#000; stroke-width:1.5; }
  .covkbd .klbl { font-family:monospace; font-weight:bold; font-size:14px; text-anchor:middle; dominant-baseline:central;
    animation:kblink 2.4s ease-in-out infinite; }
  .covkbd .lbl-dark { fill:#141414; }
  .covkbd .lbl-light { fill:#e6e6e6; }
  .covkbd .lbl-on { fill:#ffffff; }
  @keyframes kblink { 0%,100% { opacity:1; } 50% { opacity:.28; } }
  .covkbd .k-golbl { fill:#fff; font-family:monospace; font-weight:bold; font-size:26px; letter-spacing:2px; }
  /* world-map backdrop (assets/cover-map.jpg) — global vessel/fishing density as an
     ambient wallpaper behind the boot dashboard, in place of the keyboard. */
  .covmap { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; }
  .covmap img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:center center;
    opacity:.86; filter:saturate(1.22) brightness(1.08) contrast(1.1); }
  .covmap::after { content:""; position:absolute; inset:0;
    background:radial-gradient(ellipse 82% 70% at 50% 44%, rgba(8,7,4,.12) 0%, rgba(6,5,3,.34) 70%, rgba(4,3,2,.52) 100%); }
  /* animated node-atlas backdrop (earth + hubs + signal trails), drawn by JS */
  .covatlas { position:absolute; inset:0; width:100%; height:100%; z-index:0;
    display:block; pointer-events:none; opacity:.95; }
  /* softly pulsing financial-hub nodes over the map */
  .covnodes { position:absolute; inset:0; z-index:1; pointer-events:none; }
  .cnode { position:absolute; transform:translate(-50%,-50%); }
  .cnode .dot { width:8px; height:8px; border-radius:50%; background:var(--amber2);
    box-shadow:0 0 12px 2px rgba(255,176,72,.9); }
  .cnode .ring { position:absolute; left:4px; top:4px; width:8px; height:8px; border-radius:50%;
    transform:translate(-50%,-50%); border:1.5px solid rgba(255,176,72,.85);
    animation:cnpulse 3s ease-out infinite; }
  .cnode .clbl { position:absolute; left:13px; top:50%; transform:translateY(-50%);
    color:var(--amber2); font-size:9.5px; font-weight:bold; letter-spacing:2px; white-space:nowrap;
    text-shadow:0 0 6px #000, 0 0 6px #000; opacity:.85; }
  @keyframes cnpulse { 0% { width:8px; height:8px; opacity:.85; }
    100% { width:42px; height:42px; opacity:0; } }
  .coverscan { position:absolute; inset:0; z-index:5; pointer-events:none;
    background:linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,.16) 50%); background-size:100% 4px; }
  .coverscan::after { content:""; position:absolute; left:0; right:0; height:160px; top:-160px;
    background:linear-gradient(rgba(255,160,40,0), rgba(255,160,40,.10), rgba(255,160,40,0));
    animation:coversweep 5s linear infinite; }
  @keyframes coversweep { from { top:-160px; } to { top:100%; } }
  /* keep canvas (.coverfx) and scanline (.coverscan) as absolute layers — only the
     structural rows get a stacking context, so they sit above the rain. */
  .covtop, .covmain, .covcmd, .covtape, .covfn { position:relative; z-index:2; }
  /* header bar */
  .covtop { display:flex; align-items:center; justify-content:space-between; gap:12px;
    background:var(--amber); color:#000; font-weight:bold; font-size:12px; letter-spacing:1px;
    padding:max(5px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 5px max(12px,env(safe-area-inset-left)); }
  .covtop .mid { opacity:.8; letter-spacing:3px; font-size:11px; }
  /* main 3-column grid: left board | center boot | right board */
  .covmain { display:grid; grid-template-columns:minmax(0,1fr);
    gap:10px; padding:12px; min-height:0; }
  .covpanel { display:flex; flex-direction:column; min-height:0;
    border:1px solid var(--line); background:rgba(12,9,5,.5); overflow:hidden;
    -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }
  /* minimal side panels: compact card pinned to the top, map breathes below */
  .covside { align-self:start; }
  .ptitle { background:var(--amber); color:#000; font-weight:bold; font-size:10px; letter-spacing:1.5px;
    padding:3px 8px; display:flex; justify-content:space-between; }
  .ptitle .live { display:inline-flex; align-items:center; gap:5px; }
  .ptitle .live::before { content:"●"; color:#0a0; animation:covpulse 1.2s infinite; }
  .qboard { padding:2px 4px; overflow:hidden; }
  .qrow { display:grid; grid-template-columns:1fr auto auto; gap:8px; align-items:baseline;
    padding:3.5px 6px; font-size:12px; border-bottom:1px solid rgba(255,160,40,.06); }
  .qrow.flash { background:rgba(255,160,40,.16); }
  .qsym { color:var(--amber); font-weight:bold; letter-spacing:.5px; }
  .qpx { color:var(--amber2); text-align:right; font-variant-numeric:tabular-nums; }
  .qch { text-align:right; min-width:62px; font-variant-numeric:tabular-nums; }
  .qch.up { color:var(--green); } .qch.dn { color:#ff5c5c; }
  /* center boot panel */
  .covcenter { align-items:center; justify-content:center; text-align:center; padding:18px 16px;
    background:transparent; border:none; -webkit-backdrop-filter:none; backdrop-filter:none; }
  .covbrand { font-size:clamp(34px,7.2vw,76px); font-weight:bold; letter-spacing:9px; line-height:1; color:var(--amber2);
    text-shadow:0 0 10px rgba(255,176,72,.85), 0 0 30px rgba(255,160,40,.55), 0 0 70px rgba(255,160,40,.3); animation:covflicker 4s infinite; }
  @keyframes covflicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:.4} 94%{opacity:1} 96%{opacity:.75} 97%{opacity:1} }
  .covsub { color:var(--amber2); letter-spacing:5px; font-size:clamp(9px,1.8vw,13px); margin-top:8px; }
  .covread { color:var(--amber2); font-size:11.5px; letter-spacing:1.5px; text-align:center; width:100%; max-width:600px;
    margin:34px auto 12px; white-space:nowrap; overflow:hidden; text-shadow:0 0 8px rgba(255,160,40,.3); }
  .covread b { color:#fff; font-weight:600; font-variant-numeric:tabular-nums; }
  .covbar { width:min(420px,90%); height:7px; border:1px solid var(--line); background:#0c0a06;
    border-radius:2px; overflow:hidden; margin:4px auto 0; }
  .covbar i { display:block; height:100%; width:0; border-radius:2px;
    background:linear-gradient(90deg,var(--amber),var(--amber2)); box-shadow:0 0 12px rgba(255,160,40,.6); transition:width .3s ease; }
  .coventer { margin-top:16px; color:var(--amber); letter-spacing:2px; font-size:12px; cursor:pointer; opacity:0; transition:opacity .4s; }
  .coventer.show { opacity:1; animation:covpulse 1.5s ease-in-out infinite; }
  @keyframes covpulse { 50% { opacity:.35; } }
  /* command line */
  .covcmd { background:#1a1407; border-top:1px solid var(--line); border-bottom:1px solid var(--line);
    padding:7px 12px; color:var(--amber2); font-size:13px; letter-spacing:.5px; white-space:nowrap; overflow:hidden; }
  .covcmd .prompt { color:var(--amber); font-weight:bold; }
  /* headline ticker */
  .covtape { overflow:hidden; white-space:nowrap; background:#000; border-bottom:1px solid var(--line); padding:6px 0; }
  .covtapetrack { display:inline-block; white-space:nowrap; animation:tscroll 42s linear infinite; font-size:12px; }
  .covtape .th { color:var(--amber2); margin:0 22px; }
  /* function-key footer */
  .covfn { display:flex; background:#0c0a06; padding-bottom:env(safe-area-inset-bottom); }
  .covfn .fk { flex:1; text-align:center; padding:7px 4px; font-size:10.5px; letter-spacing:1px;
    color:var(--dim); border-right:1px solid var(--line); white-space:nowrap; overflow:hidden; }
  .covfn .fk:last-child { border-right:none; }
  .covfn .fk b { color:#000; background:var(--amber); padding:0 4px; border-radius:1px; margin-right:5px; font-size:10px; }
  .covfn .fk.go { color:var(--amber); }
  @media (max-width:760px) {
    .covmain { grid-template-columns:1fr; }
    .covside { display:none; }
    .covfn .fk.opt { display:none; }
    /* on a portrait phone the wide map is cropped to a center strip, so the
       geo-positioned hub nodes would float over empty edges — hide them. */
    .covnodes { display:none; }
    .covtop .mid { display:none; }
    .covbrand { letter-spacing:4px; }
    .covsub { letter-spacing:3px; }
    /* let the network readout wrap instead of clipping its tail on a phone */
    .covread { white-space:normal; font-size:10.5px; line-height:1.6; max-width:92%; letter-spacing:1px; }
    .covcmd { font-size:11px; }
  }
  /* ---- phone layout for the digest below the cover ---- */
  @media (max-width:600px) {
    body { font-size:13.5px; }
    .wrap { padding:0 12px; }
    .chrome { font-size:11px; letter-spacing:.5px; padding:6px 10px; }
    .status { font-size:11px; letter-spacing:0; }
    h1 { font-size:17px; margin:14px 0 2px; }
    /* category filters: one swipeable row instead of stacking into many rows */
    .newslist { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding-bottom:2px; }
    .newslist::-webkit-scrollbar { display:none; }
    .newsitem { flex:0 0 auto; }
    .sectiontab { padding:8px 14px; font-size:12px; }
    .statrow { grid-template-columns:86px 1fr 36px; gap:8px; font-size:11px; }
    .statlabel { letter-spacing:0; }
    .card { padding:11px 12px; }
    .reader { padding:18px 10px; }
  }
  /* very narrow phones — keep the boot brand/readout from crowding the edges */
  @media (max-width:380px) {
    .covbrand { letter-spacing:2px; }
    .covsub { letter-spacing:2px; font-size:9.5px; }
    .covread { font-size:10px; letter-spacing:.5px; }
    .covtop .windots { gap:6px; }
    .chrome, .covtop { font-size:11px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .coverscan::after, .covbrand, .coventer.show, .covtapetrack, .ptitle .live::before, .covkbd .klbl { animation:none; }
  }
</style>
</head>
<body>
  <div class="cover" id="cover" aria-hidden="true">
    <canvas class="coverfx" id="coverfx"></canvas>
    ${covBackdrop}
    ${covNodes}
    <div class="covtop">
      <span><span class="windots"><span class="wd d-r">✕</span><span class="wd d-y">⟳</span><span class="wd d-g"></span></span>&nbsp;&nbsp;JUMPFIGURE</span>
      <span class="mid">GLOBAL&nbsp;MARKET&nbsp;NETWORK</span>
      <span><span id="covclock">--:--:--</span></span>
    </div>
    <div class="covmain">
      <div class="covpanel covcenter">
        <div class="covbrand">JUMPFIGURE</div>
        <div class="covread" id="covread"></div>
        <div class="covbar"><i id="covbarfill"></i></div>
        <div class="coventer" id="coventer">[ PRESS ENTER TO LAUNCH ]&nbsp;<span class="blink">▍</span></div>
      </div>
    </div>
    <div class="covcmd"><span class="prompt">JUMPFIGURE&gt;</span> <span id="covcmdtext"></span><span class="blink">▍</span></div>
    <div class="coverscan"></div>
  </div>
  <div class="chrome">
    <span><span class="windots"><button class="wd d-r" id="wdClose" type="button" title="Close" aria-label="Close">✕</button><button class="wd d-y" id="wdReload" type="button" title="Reload" aria-label="Reload">⟳</button><button class="wd d-g" id="wdFull" type="button" title="Full screen" aria-label="Full screen"></button></span>&nbsp;&nbsp;JUMPFIGURE</span>
  </div>
  <div class="wrap">
    <div class="status">▸ LIVE · <span id="clock">--:--:--</span> · AUTO-REFRESH <b>2s</b> · ${order.length} SOURCES<span class="blink">&nbsp;▍</span></div>
    <h1>Jumpfigure — ${esc(dateStr)}</h1>
    <div class="meta">Generated ${now.toISOString()} · ${results.length} stories</div>
    <div class="sectiontabs" id="sectiontabs">
      <button class="sectiontab active" data-view="news" type="button">▸ NEWS</button>
      <button class="sectiontab" data-view="market" type="button">▸ MARKET</button>
      <button class="sectiontab" data-view="statistic" type="button">▸ STATISTIC</button>
    </div>

    <div id="newsView">
      <div class="newsmenu" id="newsmenu">
        <ul class="newslist" id="newslist">${items}</ul>
      </div>
      <div class="empty" id="empty">No stories in this category.</div>
      <div class="feed" id="feed">
${cards}
      </div>
    </div>

    <div id="marketView" hidden>
      ${tickerHtml ? `<div class="tickerbar"><div class="tickertrack">${tickerHtml}</div></div>` : ''}
      <div class="mktsec">
        <div class="mkthead">▸ MARKET HEATMAP</div>
        <div id="heatHost" class="chartgrid"></div>
      </div>
      <div class="mktsec">
        <div class="mkthead">▸ LIVE MARKETS</div>
        <div id="tvHost"></div>
      </div>
      <div class="mktsec duo">
        <div>
          <div class="mkthead">▸ ECONOMIC CALENDAR</div>
          <div id="calHost" class="panelbox"></div>
        </div>
        <div>
          <div class="mkthead">▸ STREET RESEARCH</div>
          <div class="panelbox rscroll">${researchHtml}</div>
        </div>
      </div>
    </div>

    <div id="statisticView" hidden>${statisticHtml}</div>
    <div class="foot">JUMPFIGURE · powered by Gemini · ${order.map(esc).join(' · ')}</div>
  </div>
  <script>
    (function () {
      var SRC = ${order.length}, STO = ${results.length};

      // ---- intro cover: Bloomberg-style boot dashboard, then launch the terminal ----
      var cover = document.getElementById('cover');
      if (cover) {
        document.body.style.overflow = 'hidden';
        var raf = 0, raf2 = 0, raf3 = 0, atlasSpawnT = 0, readT = 0, relayCount = 9000 + Math.floor(Math.random() * 4000), timers = [];
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

        // (1) faint number-rain behind the panels
        var cv = document.getElementById('coverfx');
        if (cv && cv.getContext && !document.getElementById('covatlas')) {
          var ctx = cv.getContext('2d');
          var glyphs = '0123456789$+-.%▲▼';
          var fs = 16, cols = 0, drops = [];
          function csize() {
            cv.width = window.innerWidth; cv.height = window.innerHeight;
            cols = Math.ceil(cv.width / fs); drops = [];
            for (var c = 0; c < cols; c++) drops[c] = Math.random() * -60;
          }
          csize();
          window.addEventListener('resize', csize);
          function rain() {
            ctx.fillStyle = 'rgba(6,5,3,0.10)';
            ctx.fillRect(0, 0, cv.width, cv.height);
            ctx.font = fs + 'px monospace';
            for (var c = 0; c < cols; c++) {
              var g = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
              var y = drops[c] * fs;
              var rr = Math.random();
              ctx.fillStyle = rr > 0.9 ? '#eafff2' : (rr > 0.48 ? '#16d672' : '#ff3b3b');
              ctx.fillText(g, c * fs, y);
              if (y > cv.height && Math.random() > 0.97) drops[c] = 0;
              drops[c] += 0.5;
            }
            raf = window.requestAnimationFrame(rain);
          }
          rain();
        }

        // (1b) animated node-atlas: earth + pulsing hubs + slow signal arcs.
        var atlas = document.getElementById('covatlas');
        if (atlas && atlas.getContext) {
          var actx = atlas.getContext('2d');
          var EB = { lonMin: -180, lonMax: 180, latMin: -56, latMax: 83 };
          var EASPECT = (EB.lonMax - EB.lonMin) / (EB.latMax - EB.latMin);
          var NODES = [
            { lon: -74.01, lat: 40.71, major: 1, name: 'USA' }, { lon: -122.42, lat: 37.77, major: 0, name: 'USA' },
            { lon: -80.19, lat: 25.76, major: 0, name: 'USA' }, { lon: -79.38, lat: 43.65, major: 0, name: 'CANADA' },
            { lon: -89.22, lat: 13.69, major: 1, name: 'EL SALVADOR' }, { lon: -46.63, lat: -23.55, major: 0, name: 'BRAZIL' },
            { lon: -0.13, lat: 51.51, major: 1, name: 'UK' }, { lon: 8.68, lat: 50.11, major: 0, name: 'GERMANY' },
            { lon: 8.54, lat: 47.37, major: 0, name: 'SWITZERLAND' }, { lon: 4.9, lat: 52.37, major: 0, name: 'NETHERLANDS' },
            { lon: 28.98, lat: 41.01, major: 0, name: 'TURKEY' }, { lon: 37.62, lat: 55.75, major: 0, name: 'RUSSIA' },
            { lon: 3.38, lat: 6.52, major: 0, name: 'NIGERIA' }, { lon: 28.04, lat: -26.2, major: 0, name: 'SOUTH AFRICA' },
            { lon: 55.27, lat: 25.2, major: 1, name: 'UAE' }, { lon: 72.88, lat: 19.08, major: 0, name: 'INDIA' },
            { lon: 103.82, lat: 1.35, major: 1, name: 'SINGAPORE' }, { lon: 106.85, lat: -6.21, major: 1, name: 'INDONESIA' },
            { lon: 114.17, lat: 22.32, major: 1, name: 'HONG KONG' }, { lon: 121.47, lat: 31.23, major: 0, name: 'CHINA' },
            { lon: 126.98, lat: 37.57, major: 0, name: 'SOUTH KOREA' }, { lon: 139.65, lat: 35.68, major: 1, name: 'JAPAN' },
            { lon: 151.21, lat: -33.87, major: 0, name: 'AUSTRALIA' }
          ];
          var earthImg = new Image(), earthReady = false;
          earthImg.onload = function () { earthReady = true; };
          earthImg.src = '${COVER_EARTH_DATAURI}';
          var AW = 0, AH = 0, adpr = 1, mapW = 1000, mapH = mapW / EASPECT, ascale = 1, aox = 0, aoy = 0;
          var lw = mapW / 1600;
          function asz() {
            AW = atlas.clientWidth || window.innerWidth;
            AH = atlas.clientHeight || window.innerHeight;
            adpr = Math.min(window.devicePixelRatio || 1, 2);
            atlas.width = Math.round(AW * adpr); atlas.height = Math.round(AH * adpr);
            ascale = Math.max(AW / mapW, AH / mapH);
            aox = (AW - mapW * ascale) / 2; aoy = (AH - mapH * ascale) / 2;
          }
          function aproj(lon, lat) {
            return [(lon - EB.lonMin) / (EB.lonMax - EB.lonMin) * mapW,
                    (EB.latMax - lat) / (EB.latMax - EB.latMin) * mapH];
          }
          function gc(a, b, n) {
            n = n || 80; var R = Math.PI / 180;
            var la1 = a.lat * R, lo1 = a.lon * R, la2 = b.lat * R, lo2 = b.lon * R;
            var A = [Math.cos(la1) * Math.cos(lo1), Math.cos(la1) * Math.sin(lo1), Math.sin(la1)];
            var B = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
            var dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
            var w = Math.acos(dot), sw = Math.sin(w), pts = [];
            for (var i = 0; i <= n; i++) {
              var t = i / n, s1, s2;
              if (sw < 1e-6) { s1 = 1 - t; s2 = t; } else { s1 = Math.sin((1 - t) * w) / sw; s2 = Math.sin(t * w) / sw; }
              var x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
              pts.push({ lat: Math.asin(Math.max(-1, Math.min(1, z))) / R, lon: Math.atan2(y, x) / R });
            }
            return pts;
          }
          var asignals = [];
          function aspawn() {
            var s = Math.floor(Math.random() * NODES.length), d;
            do { d = Math.floor(Math.random() * NODES.length); } while (d === s);
            asignals.push({ d: d, path: gc(NODES[s], NODES[d], 80), t0: performance.now(), dur: 5200 + Math.random() * 4400, ring: 0 });
          }
          function adraw(now) {
            actx.setTransform(adpr, 0, 0, adpr, 0, 0);
            actx.clearRect(0, 0, AW, AH);
            actx.setTransform(ascale * adpr, 0, 0, ascale * adpr, aox * adpr, aoy * adpr);
            if (earthReady) actx.drawImage(earthImg, 0, 0, mapW, mapH);
            else { actx.fillStyle = '#070d16'; actx.fillRect(0, 0, mapW, mapH); }
            actx.strokeStyle = 'rgba(150,190,225,0.05)'; actx.lineWidth = lw;
            for (var lo = EB.lonMin; lo <= EB.lonMax; lo += 30) { var gx = aproj(lo, 0)[0]; actx.beginPath(); actx.moveTo(gx, 0); actx.lineTo(gx, mapH); actx.stroke(); }
            for (var laa = -30; laa <= 60; laa += 30) { var gy = aproj(0, laa)[1]; actx.beginPath(); actx.moveTo(0, gy); actx.lineTo(mapW, gy); actx.stroke(); }
            actx.lineCap = 'round'; actx.lineJoin = 'round';
            for (var k = asignals.length - 1; k >= 0; k--) {
              var sig = asignals[k];
              var prog = Math.max(0, Math.min(1, (now - sig.t0) / sig.dur));
              var P = sig.path, N = P.length, pj = [];
              for (var i = 0; i < N; i++) pj.push(aproj(P[i].lon, P[i].lat));
              actx.strokeStyle = 'rgba(247,147,26,0.09)'; actx.lineWidth = lw * 0.9;
              for (var i = 0; i < N - 1; i++) { if (Math.abs(pj[i + 1][0] - pj[i][0]) > mapW * 0.5) continue; actx.beginPath(); actx.moveTo(pj[i][0], pj[i][1]); actx.lineTo(pj[i + 1][0], pj[i + 1][1]); actx.stroke(); }
              var fp = prog * (N - 1), hi = Math.max(0, Math.min(N - 2, Math.floor(fp))), f = fp - hi;
              var head = [pj[hi][0] + (pj[hi + 1][0] - pj[hi][0]) * f, pj[hi][1] + (pj[hi + 1][1] - pj[hi][1]) * f];
              var wrapH = Math.abs(pj[hi + 1][0] - pj[hi][0]) > mapW * 0.5;
              var hpt = wrapH ? pj[hi] : head, stt = Math.max(0, hi - 14);
              for (var i = stt; i < hi; i++) { if (Math.abs(pj[i + 1][0] - pj[i][0]) > mapW * 0.5) continue; var aa = (i - stt) / Math.max(1, (hi - stt)); actx.strokeStyle = 'rgba(255,170,60,' + (0.08 + aa * 0.55) + ')'; actx.lineWidth = lw * (0.6 + aa * 1.1); actx.beginPath(); actx.moveTo(pj[i][0], pj[i][1]); actx.lineTo(pj[i + 1][0], pj[i + 1][1]); actx.stroke(); }
              if (prog < 1) {
                var r = mapW / 520;
                var g = actx.createRadialGradient(hpt[0], hpt[1], 0, hpt[0], hpt[1], r * 3.2);
                g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(0.4, 'rgba(255,160,50,0.8)'); g.addColorStop(1, 'rgba(255,150,40,0)');
                actx.fillStyle = g; actx.beginPath(); actx.arc(hpt[0], hpt[1], r * 3.2, 0, 7); actx.fill();
                actx.fillStyle = '#fff7ea'; actx.beginPath(); actx.arc(hpt[0], hpt[1], r * 0.8, 0, 7); actx.fill();
              } else {
                sig.ring += 0.04;
                var dp = aproj(NODES[sig.d].lon, NODES[sig.d].lat), rr = sig.ring * (mapW / 45), al = Math.max(0, 0.5 - sig.ring * 0.5);
                actx.strokeStyle = 'rgba(255,180,77,' + al + ')'; actx.lineWidth = lw; actx.beginPath(); actx.arc(dp[0], dp[1], rr, 0, 7); actx.stroke();
                if (sig.ring > 1) asignals.splice(k, 1);
              }
            }
            for (var i = 0; i < NODES.length; i++) {
              var n = NODES[i], p = aproj(n.lon, n.lat), pu = 0.5 + 0.5 * Math.sin(now / 650 + i);
              var core = (n.major ? 2.6 : 1.8) * (mapW / 900);
              actx.strokeStyle = 'rgba(247,147,26,' + (0.22 + pu * 0.22) + ')'; actx.lineWidth = lw * 0.9;
              actx.beginPath(); actx.arc(p[0], p[1], core * 2.1, 0, 7); actx.stroke();
              actx.fillStyle = '#ffd9a0'; actx.beginPath(); actx.arc(p[0], p[1], core, 0, 7); actx.fill();
              actx.fillStyle = n.major ? '#f7931a' : '#ffb84d'; actx.beginPath(); actx.arc(p[0], p[1], core * 0.55, 0, 7); actx.fill();
            }
            actx.setTransform(adpr, 0, 0, adpr, 0, 0);
            var vg = actx.createRadialGradient(AW / 2, AH * 0.44, Math.min(AW, AH) * 0.1, AW / 2, AH * 0.44, Math.max(AW, AH) * 0.72);
            vg.addColorStop(0, 'rgba(4,6,12,0.28)'); vg.addColorStop(0.55, 'rgba(4,6,12,0.52)'); vg.addColorStop(1, 'rgba(2,4,9,0.82)');
            actx.fillStyle = vg; actx.fillRect(0, 0, AW, AH);
            // country labels beside each node — drawn in screen space, above the
            // vignette so the text stays crisp over the darkened map.
            actx.textBaseline = 'middle';
            actx.font = '600 ' + Math.max(9, Math.round(Math.min(AW, AH) / 64)) + 'px "SF Mono","Consolas",ui-monospace,monospace';
            for (var li = 0; li < NODES.length; li++) {
              var ln = NODES[li], lp = aproj(ln.lon, ln.lat);
              var lsx = aox + lp[0] * ascale, lsy = aoy + lp[1] * ascale;
              if (lsx < -60 || lsx > AW + 60 || lsy < -20 || lsy > AH + 20) continue;
              var lcore = (ln.major ? 2.6 : 1.8) * (mapW / 900) * ascale;
              var ltw = actx.measureText(ln.name).width;
              var lleft = lsx > AW - ltw - 16;
              actx.textAlign = lleft ? 'right' : 'left';
              var lox = (lleft ? -1 : 1) * (lcore * 2.4 + 4);
              actx.fillStyle = 'rgba(0,0,0,0.6)';
              actx.fillText(ln.name, lsx + lox + 0.7, lsy + 0.7);
              actx.fillStyle = ln.major ? 'rgba(255,201,128,0.95)' : 'rgba(226,236,246,0.7)';
              actx.fillText(ln.name, lsx + lox, lsy);
            }
            if (!reduce) raf3 = window.requestAnimationFrame(adraw);
          }
          asz();
          window.addEventListener('resize', asz);
          if (reduce) {
            for (var i = 0; i < 7; i++) aspawn();
            for (var i = 0; i < asignals.length; i++) asignals[i].t0 = performance.now() - asignals[i].dur * ((i + 1) / 9);
            adraw(performance.now());
          } else {
            for (var i = 0; i < 4; i++) later(aspawn, i * 450);
            atlasSpawnT = setInterval(function () { if (asignals.length < 13) aspawn(); }, 650);
            raf3 = window.requestAnimationFrame(adraw);
          }
        }

        // (2) live-looking quote boards (random walk + cell flash on update)
        var allRows = [];
        function buildBoard(hostId, rows) {
          var host = document.getElementById(hostId);
          if (!host) return;
          for (var i = 0; i < rows.length; i++) {
            var row = document.createElement('div');
            row.className = 'qrow';
            var sym = document.createElement('span'); sym.className = 'qsym'; sym.textContent = rows[i][0];
            var px = document.createElement('span'); px.className = 'qpx';
            var ch = document.createElement('span'); ch.className = 'qch';
            row.appendChild(sym); row.appendChild(px); row.appendChild(ch);
            host.appendChild(row);
            var s = { row: row, px: px, ch: ch, price: rows[i][1], dec: rows[i][2], chg: (Math.random() * 4 - 2) };
            paintRow(s);
            allRows.push(s);
          }
        }
        function paintRow(s) {
          s.px.textContent = s.price.toLocaleString('en-US', { minimumFractionDigits: s.dec, maximumFractionDigits: s.dec });
          var up = s.chg >= 0;
          s.ch.textContent = (up ? '▲' : '▼') + Math.abs(s.chg).toFixed(2) + '%';
          s.ch.className = 'qch ' + (up ? 'up' : 'dn');
        }
        // side quote boards removed from the cover — keep tickT defined so launch()'s
        // clearInterval(tickT) stays valid.
        var tickT = 0;

        // (3) cover clock
        var covClock = document.getElementById('covclock');
        function ctick() { if (covClock) covClock.textContent = new Date().toLocaleTimeString(); }
        ctick();
        var clockT = setInterval(ctick, 1000);
        timers.push(clockT);

        // (4) typing command line
        var cmdEl = document.getElementById('covcmdtext');
        var cmd = 'run daily-digest --sources ' + SRC + ' --stories ' + STO + ' --live';
        var ci = 0;
        function typeCmd() {
          if (!cmdEl) return;
          if (ci <= cmd.length) { cmdEl.textContent = cmd.slice(0, ci++); later(typeCmd, 45); }
        }
        later(typeCmd, 700);

        // (5) boot log + progress, then ENTER prompt / auto-launch
        var cread = document.getElementById('covread');
        var cbar = document.getElementById('covbarfill');
        var center = document.getElementById('coventer');
        var launched = false, autoT = 0;
        function launch() {
          if (launched) return;
          launched = true;
          for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
          clearInterval(tickT); clearInterval(clockT); clearTimeout(autoT); clearInterval(atlasSpawnT); clearInterval(readT);
          cover.classList.add('gone');
          document.body.style.overflow = '';
          setTimeout(function () {
            if (raf) window.cancelAnimationFrame(raf);
            if (raf2) window.cancelAnimationFrame(raf2);
            if (raf3) window.cancelAnimationFrame(raf3);
            cover.style.display = 'none';
          }, 750);
        }
        // live network readout (HUBS / MARKETS LIVE / SIGNALS) + loading bar
        var hubN = (typeof NODES !== 'undefined') ? NODES.length : 23;
        var mktN = (typeof NODES !== 'undefined') ? NODES.filter(function (n) { return n.major; }).length : 8;
        function paintRead() {
          if (cread) cread.innerHTML = '▸ ' + hubN + ' HUBS ONLINE  ·  ' + mktN + ' MARKETS LIVE  ·  <b>' +
            relayCount.toLocaleString('en-US') + '</b> SIGNALS ▲';
        }
        var prog = 0, doneShown = false;
        readT = setInterval(function () {
          if (Math.random() < 0.65) relayCount += 1 + Math.floor(Math.random() * 3);
          paintRead();
          if (prog < 1) {
            prog = Math.min(1, prog + 0.05);
            if (cbar) cbar.style.width = Math.round(prog * 100) + '%';
          } else if (!doneShown) {
            doneShown = true;
            if (center) center.classList.add('show');
            autoT = setTimeout(launch, 3500);
          }
        }, 110);
        paintRead();
        cover.addEventListener('click', launch);
        document.addEventListener('keydown', function (e) {
          if (!launched && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) launch();
        });
      }

      var menu = document.getElementById('newsmenu');
      if (!menu) return;
      menu.style.display = 'block'; // reveal only when JS runs (website, not email)
      var list = document.getElementById('newslist');
      var items = list.querySelectorAll('.newsitem');
      var cards = document.querySelectorAll('.card');
      var empty = document.getElementById('empty');
      function filter(cat) {
        var shown = 0;
        for (var i = 0; i < cards.length; i++) {
          var match = cat === 'ALL' || cards[i].getAttribute('data-cat') === cat;
          cards[i].style.display = match ? '' : 'none';
          if (match) shown++;
        }
        if (empty) empty.style.display = shown ? 'none' : 'block';
      }
      for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function () {
          for (var j = 0; j < items.length; j++) items[j].classList.remove('active');
          this.classList.add('active');
          filter(this.getAttribute('data-cat'));
        });
      }

      // Section tabs: NEWS / MARKET (revealed only on the website).
      var sectiontabs = document.getElementById('sectiontabs');
      var newsView = document.getElementById('newsView');
      var marketView = document.getElementById('marketView');
      var statisticView = document.getElementById('statisticView');
      sectiontabs.style.display = 'flex';
      var sectBtns = sectiontabs.querySelectorAll('.sectiontab');
      var marketLoaded = false;
      function showView(view) {
        for (var i = 0; i < sectBtns.length; i++) {
          sectBtns[i].classList.toggle('active', sectBtns[i].getAttribute('data-view') === view);
        }
        newsView.hidden = view !== 'news';
        marketView.hidden = view !== 'market';
        if (statisticView) statisticView.hidden = view !== 'statistic';
        if (view === 'market' && !marketLoaded) { loadMarket(); marketLoaded = true; }
      }
      for (var i = 0; i < sectBtns.length; i++) {
        sectBtns[i].addEventListener('click', function () { showView(this.getAttribute('data-view')); });
      }

      // Correlation Matrix sub-toggle: CROSS-ASSET (static daily) vs CRYPTO (live).
      var corrPanelEl = statisticView ? statisticView.querySelector('.statpanel[data-stat="corr"]') : null;
      if (corrPanelEl) {
        var corrTabs = corrPanelEl.querySelectorAll('.corrtab');
        var corrSubs = corrPanelEl.querySelectorAll('.corrsub');
        var liveStarted = false;
        for (var ct = 0; ct < corrTabs.length; ct++) {
          corrTabs[ct].addEventListener('click', function () {
            var key = this.getAttribute('data-corr');
            for (var a = 0; a < corrTabs.length; a++) corrTabs[a].classList.toggle('active', corrTabs[a] === this);
            for (var b = 0; b < corrSubs.length; b++) corrSubs[b].hidden = corrSubs[b].getAttribute('data-corr') !== key;
            if (key === 'crypto' && !liveStarted) { liveStarted = true; startCryptoCorr(); }
          });
        }
      }

      // Live crypto correlation: stream last prices over a keyless Binance
      // WebSocket, sample once per second into a rolling return window, and
      // recompute the Pearson correlation matrix every second. Lazy — only runs
      // the first time the CRYPTO·LIVE tab is opened.
      function startCryptoCorr() {
        var CRYPTO = ${JSON.stringify(cryptoList)};
        var N = CRYPTO.length, WINDOW = 120;
        var table = document.getElementById('cryptoTable');
        var statusEl = document.getElementById('cryptoStatus');
        if (!table) return;

        var price = [], have = [], lastSample = [], rets = [], cells = [];
        for (var i = 0; i < N; i++) { price[i] = 0; have[i] = false; lastSample[i] = 0; rets[i] = []; }
        for (var i = 0; i < N; i++) {
          cells[i] = [];
          for (var j = 0; j < N; j++) cells[i][j] = table.querySelector('td[data-i="' + i + '"][data-j="' + j + '"]');
        }

        function ccColor(r) {
          var a = (0.1 + Math.min(1, Math.abs(r)) * 0.55).toFixed(3);
          return r >= 0 ? 'rgba(61,247,107,' + a + ')' : 'rgba(255,92,92,' + a + ')';
        }
        function avg(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i]; return x.length ? s / x.length : 0; }
        function pearson(a, b) {
          var n = Math.min(a.length, b.length);
          if (n < 2) return 0;
          var ma = avg(a), mb = avg(b), num = 0, da = 0, db = 0;
          for (var i = 0; i < n; i++) { var xa = a[i] - ma, xb = b[i] - mb; num += xa * xb; da += xa * xa; db += xb * xb; }
          var d = Math.sqrt(da * db);
          return d ? Math.max(-1, Math.min(1, num / d)) : 0;
        }
        function paint(filled) {
          for (var i = 0; i < N; i++) {
            for (var j = 0; j < N; j++) {
              var cell = cells[i][j];
              if (!cell) continue;
              if (i === j) { cell.textContent = '1.00'; cell.style.background = ccColor(1); }
              else if (filled < 2) { cell.textContent = '·'; cell.style.background = ''; }
              else { var r = pearson(rets[i], rets[j]); cell.textContent = r.toFixed(2); cell.style.background = ccColor(r); }
            }
          }
        }

        // 1s sampler: turn the latest streamed prices into a rolling return series.
        setInterval(function () {
          for (var i = 0; i < N; i++) {
            if (!have[i]) continue;
            if (lastSample[i]) { rets[i].push((price[i] - lastSample[i]) / lastSample[i]); if (rets[i].length > WINDOW) rets[i].shift(); }
            lastSample[i] = price[i];
          }
          var filled = rets[0].length;
          if (statusEl) statusEl.textContent = filled < 2
            ? '▸ LIVE · warming up ' + filled + '/' + WINDOW + ' …'
            : '▸ LIVE · streaming · window ' + filled + '/' + WINDOW + 's · ' + new Date().toLocaleTimeString();
          paint(filled);
        }, 1000);

        // Binance combined mini-ticker stream (one last-price update/sec/symbol).
        var idx = {};
        for (var i = 0; i < N; i++) idx[CRYPTO[i].s.toUpperCase()] = i;
        function connect() {
          var streams = CRYPTO.map(function (c) { return c.s + '@miniTicker'; }).join('/');
          var ws;
          // Binance's public market-data domain (keyless, CORS/proxy-friendly).
          try { ws = new WebSocket('wss://data-stream.binance.vision/stream?streams=' + streams); }
          catch (e) { if (statusEl) statusEl.textContent = '▸ LIVE FEED UNAVAILABLE (blocked?)'; return; }
          ws.onmessage = function (ev) {
            try {
              var m = JSON.parse(ev.data), d = m.data || m, k = idx[d.s];
              if (k !== undefined) { price[k] = parseFloat(d.c); have[k] = true; }
            } catch (e) {}
          };
          ws.onclose = function () { setTimeout(connect, 3000); };
          ws.onerror = function () { try { ws.close(); } catch (e) {} };
        }
        connect();
      }

      // One TradingView chart per asset class, in a grid. The free widget gives
      // the full toolbar (timeframes, indicators, drawing) + live data; candle
      // colors are fixed by the widget and can't be themed.
      var PANELS = [
        { label: 'INDEX · S&P 500', sym: 'FOREXCOM:SPXUSD' },
        { label: 'CRYPTO · BITCOIN', sym: 'BINANCE:BTCUSDT' }
      ];

      function addChart(grid, symbol) {
        var cell = document.createElement('div');
        cell.className = 'chartcell';
        var box = document.createElement('div');
        box.className = 'tradingview-widget-container chartbox';
        box.innerHTML = '<div class="tradingview-widget-container__widget" style="width:100%"></div>';
        var s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        s.async = true;
        s.text = JSON.stringify({
          width: '100%', height: 520, symbol: symbol, interval: 'D', timezone: 'Asia/Jakarta',
          theme: 'dark', style: '1', locale: 'en', allow_symbol_change: true,
          withdateranges: true, hide_side_toolbar: false, details: false, calendar: false,
          backgroundColor: 'rgba(10,10,10,1)', gridColor: 'rgba(255,160,40,0.06)',
          support_host: 'https://www.tradingview.com'
        });
        box.appendChild(s);
        cell.appendChild(box);
        grid.appendChild(cell);
      }

      function addWidget(host, file, config, cls) {
        var box = document.createElement('div');
        box.className = 'tradingview-widget-container' + (cls ? ' ' + cls : '');
        var inner = document.createElement('div');
        inner.className = 'tradingview-widget-container__widget';
        inner.style.height = '100%';
        box.appendChild(inner);
        var s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/' + file;
        s.async = true;
        s.text = JSON.stringify(config);
        box.appendChild(s);
        host.appendChild(box);
      }

      function loadMarket() {
        var host = document.getElementById('tvHost');
        host.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'chartgrid';
        host.appendChild(grid);
        for (var i = 0; i < PANELS.length; i++) addChart(grid, PANELS[i].sym);

        // Heatmaps: S&P 500 (by sector) + crypto (by market cap), live.
        var heat = document.getElementById('heatHost');
        heat.innerHTML = '';
        var hc1 = document.createElement('div');
        hc1.className = 'chartcell heatcell';
        heat.appendChild(hc1);
        addWidget(hc1, 'embed-widget-stock-heatmap.js', {
          dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic',
          blockColor: 'change', colorTheme: 'dark', locale: 'en', symbolUrl: '',
          hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true,
          hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%'
        });
        var hc2 = document.createElement('div');
        hc2.className = 'chartcell heatcell';
        heat.appendChild(hc2);
        addWidget(hc2, 'embed-widget-crypto-coins-heatmap.js', {
          dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: '24h_close_change|5',
          colorTheme: 'dark', locale: 'en', symbolUrl: '',
          hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true,
          hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%'
        });

        // Economic calendar: upcoming macro releases, medium+high impact.
        var cal = document.getElementById('calHost');
        cal.innerHTML = '';
        addWidget(cal, 'embed-widget-events.js', {
          colorTheme: 'dark', isTransparent: true, locale: 'en',
          importanceFilter: '0,1', countryFilter: 'us,eu,cn,jp,gb,id',
          width: '100%', height: '100%'
        });
      }

      // In-page article reader: clicking a story opens a terminal-style panel
      // instead of navigating away. Built via JS so emails never see it.
      var reader = document.createElement('div');
      reader.className = 'reader';
      reader.innerHTML =
        '<div class="rpanel"><div class="rphead"><span>■ ARTICLE READER · JUMPFIGURE</span>' +
        '<button class="rpclose" type="button">✕ CLOSE [ESC]</button></div>' +
        '<div class="rpbody"></div></div>';
      document.body.appendChild(reader);
      var rpbody = reader.querySelector('.rpbody');

      function openReader(card) {
        var a = card.querySelector('h2 a');
        var img = card.querySelector('img.thumb');
        var src = card.querySelector('.srcline');
        var sum = card.querySelector('.summary');
        rpbody.innerHTML = '';
        if (src) {
          var meta = document.createElement('div');
          meta.className = 'rpmeta';
          meta.innerHTML = src.innerHTML;
          rpbody.appendChild(meta);
        }
        var h = document.createElement('div');
        h.className = 'rptitle';
        h.textContent = a ? a.textContent : (card.querySelector('h2') || {}).textContent || '';
        rpbody.appendChild(h);
        if (img && img.style.display !== 'none' && img.src) {
          var im = document.createElement('img');
          im.className = 'rpimg';
          im.src = img.src;
          im.referrerPolicy = 'no-referrer';
          im.onerror = function () { this.style.display = 'none'; };
          rpbody.appendChild(im);
        }
        var hr = document.createElement('hr');
        hr.className = 'rpdivider';
        rpbody.appendChild(hr);
        var bf = card.querySelector('.fullbrief');
        if (bf) {
          var bh = document.createElement('div');
          bh.innerHTML = '<strong class="f f-brief">FULL STORY</strong>';
          rpbody.appendChild(bh);
          var b = document.createElement('div');
          b.className = 'rpbrief';
          b.innerHTML = bf.innerHTML;
          rpbody.appendChild(b);
          var hr2 = document.createElement('hr');
          hr2.className = 'rpdivider';
          rpbody.appendChild(hr2);
        }
        if (sum) {
          var s = document.createElement('div');
          s.innerHTML = sum.innerHTML;
          rpbody.appendChild(s);
        }
        if (a && a.href) {
          var btn = document.createElement('a');
          btn.className = 'rpsrc';
          btn.href = a.href;
          btn.target = '_blank';
          btn.rel = 'noopener';
          btn.textContent = 'READ ORIGINAL SOURCE ↗';
          rpbody.appendChild(btn);
        }
        reader.classList.add('open');
        reader.scrollTop = 0;
        document.body.style.overflow = 'hidden';
      }
      function closeReader() {
        reader.classList.remove('open');
        document.body.style.overflow = '';
      }
      reader.querySelector('.rpclose').addEventListener('click', closeReader);
      reader.addEventListener('click', function (e) { if (e.target === reader) closeReader(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeReader(); });
      for (var ci = 0; ci < cards.length; ci++) {
        (function (card) {
          var a = card.querySelector('h2 a');
          var img = card.querySelector('img.thumb');
          function open(e) { e.preventDefault(); openReader(card); }
          if (a) a.addEventListener('click', open);
          if (img) { img.style.cursor = 'pointer'; img.addEventListener('click', open); }
        })(cards[ci]);
      }

      // Live clock (website only; email ignores JS).
      var clockEl = document.getElementById('clock');
      function tick() { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); }
      tick();
      setInterval(tick, 1000);

      // Window controls on the title bar: full screen / minimize / close.
      var wdFull = document.getElementById('wdFull');
      if (wdFull) wdFull.addEventListener('click', function () {
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document); }
        else { var el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); }
      });
      var wdReload = document.getElementById('wdReload');
      if (wdReload) wdReload.addEventListener('click', function () { location.reload(); });
      var wdClose = document.getElementById('wdClose');
      if (wdClose) wdClose.addEventListener('click', function () {
        try { window.close(); } catch (e) {} // only works for script-opened tabs; otherwise show a curtain
        if (document.querySelector('.closedscreen')) return;
        var ov = document.createElement('div');
        ov.className = 'closedscreen';
        ov.innerHTML = '<div>\\u25B8 JUMPFIGURE SESSION ENDED<br><span>click anywhere to relaunch</span></div>';
        ov.addEventListener('click', function () { location.reload(); });
        document.body.appendChild(ov);
      });

      // Track active scrolling so background work never competes with a scroll frame.
      var isScrolling = false, scrollIdle;
      window.addEventListener('scroll', function () {
        isScrolling = true;
        clearTimeout(scrollIdle);
        scrollIdle = setTimeout(function () { isScrolling = false; }, 250);
      }, { passive: true });

      // Auto-refresh: every 2s check (in the background) whether new content was
      // published; reload only when it actually changed — keeps the page always
      // fresh without flicker. Paused while scrolling, reading, in a menu, or on MARKET.
      var stampEl = document.querySelector('.meta');
      var stamp = stampEl ? stampEl.textContent : '';
      setInterval(function () {
        if (document.hidden || isScrolling || !list.hidden || !marketView.hidden || (statisticView && !statisticView.hidden) || reader.classList.contains('open')) return;
        fetch(window.location.href, { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var m = html.match(/<div class="meta">([^<]*)<\\/div>/);
            if (m && stamp && m[1] !== stamp) window.location.reload();
          })
          .catch(function () {});
      }, 2000);
    })();
  </script>
</body>
</html>`;
}

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

// Flat markdown report — used for output/daily.md (and the email attachment).
export function buildMarkdown(results, now, dateStr) {
  const lines = [
    `# Jumpfigures — ${dateStr}`,
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
export function buildHtml(results, now, dateStr, research = [], ticker = []) {
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
  const CAT_ORDER = ['Markets', 'Economy', 'Politics', 'Technology', 'Biotechnology', 'Crypto', 'Business', 'World'];
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

  const cards = results
    .map(({ article, summary, category, brief }) => {
      const cat = category || 'World';
      const title = article.link
        ? `<a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a>`
        : esc(article.title);
      const img = article.image
        ? `<img class="thumb" src="${esc(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : '';
      const summaryHtml = colorFields(marked.parse(summary));
      // Full own-words brief, hidden in the card; the in-page reader displays it.
      const briefHtml = brief ? `<div class="fullbrief" hidden>${marked.parse(brief)}</div>` : '';
      return `      <article class="card" data-cat="${esc(cat)}">
        <h2>${title}</h2>
        <div class="srcline"><span class="f f-cat">${esc(cat.toUpperCase())}</span> <span class="f f-src">SRC</span> ${esc(article.source)}</div>
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jumpfigures Terminal — ${esc(dateStr)}</title>
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
    font-size:14px; line-height:1.55; margin:0; padding:0 0 60px;
  }
  .wrap { max-width:1480px; margin:0 auto; padding:0 18px; }
  .chrome {
    background:var(--amber); color:#000; font-weight:bold;
    display:flex; justify-content:space-between; align-items:center;
    padding:6px 12px; letter-spacing:1px; font-size:12px;
  }
  .chrome .dot { opacity:.55; letter-spacing:2px; }
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
  /* NEWS dropdown (hidden by default; revealed by JS on the website) */
  .newsmenu {
    display:none; position:sticky; top:0; z-index:5; background:var(--bg);
    padding:10px 0; border-bottom:1px solid var(--line); margin-bottom:6px;
  }
  .newswrap { position:relative; display:inline-block; }
  .newsbtn {
    font-family:inherit; font-size:12px; font-weight:bold; letter-spacing:1px; cursor:pointer;
    background:var(--amber); color:#000; border:none; padding:7px 12px; border-radius:2px;
  }
  .newsbtn .caret { margin-left:6px; }
  .newslist {
    list-style:none; margin:4px 0 0; padding:4px; position:absolute; top:100%; left:0;
    background:#0d0b06; border:1px solid #4a3a14; border-radius:2px; min-width:260px;
    max-height:60vh; overflow:auto; z-index:10;
  }
  .newslist[hidden] { display:none; }
  .newsitem {
    padding:6px 10px; cursor:pointer; color:var(--amber); font-size:12px; letter-spacing:1px;
    display:flex; justify-content:space-between; gap:16px;
  }
  .newsitem:hover { background:#241c0c; }
  .newsitem.active { background:var(--amber); color:#000; }
  .newsitem i { font-style:normal; opacity:.7; }
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
  .rscroll::-webkit-scrollbar-thumb { background:#2a2210; border-radius:4px; }
  .rcard:last-child { border-bottom:none; }
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
  /* Bloomberg-style multi-column masonry grid; leftover space at the bottom is fine. */
  .feed { column-width:340px; column-gap:18px; }
  .card {
    break-inside:avoid; -webkit-column-break-inside:avoid; display:inline-block; width:100%;
    border:1px solid var(--line); background:#0c0a06; padding:12px 14px; margin:0 0 18px; border-radius:2px;
  }
  h2 { font-size:15.5px; line-height:1.4; margin:0 0 4px; }
  h2 a { color:var(--amber2); text-decoration:none; border-bottom:1px dotted #5a4a20; }
  h2 a:hover { color:#fff; border-color:#fff; }
  .srcline { color:var(--dim); font-size:11px; margin-bottom:8px; }
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
    display:grid; grid-template-rows:auto minmax(0,1fr) auto auto auto;
    position:fixed; inset:0; z-index:100; overflow:hidden;
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
    background:var(--amber); color:#000; font-weight:bold; padding:5px 12px; font-size:12px; letter-spacing:1px; }
  .covtop .dot { opacity:.55; letter-spacing:2px; }
  .covtop .mid { opacity:.8; letter-spacing:3px; font-size:11px; }
  /* main 3-column grid: left board | center boot | right board */
  .covmain { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.55fr) minmax(0,1fr);
    gap:8px; padding:8px; min-height:0; }
  .covpanel { display:flex; flex-direction:column; min-height:0;
    border:1px solid var(--line); background:rgba(12,9,5,.52); overflow:hidden;
    -webkit-backdrop-filter:blur(1px); backdrop-filter:blur(1px); }
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
  .covcenter { align-items:center; justify-content:center; text-align:center; padding:18px 16px; }
  .covbrand { font-size:clamp(30px,6.5vw,64px); font-weight:bold; letter-spacing:6px; line-height:1; color:var(--amber);
    text-shadow:0 0 16px rgba(255,160,40,.5), 0 0 52px rgba(255,160,40,.2); animation:covflicker 4s infinite; }
  @keyframes covflicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:.4} 94%{opacity:1} 96%{opacity:.75} 97%{opacity:1} }
  .covsub { color:var(--amber2); letter-spacing:5px; font-size:clamp(9px,1.8vw,13px); margin-top:8px; }
  .covchart { display:block; width:100%; max-width:480px; height:130px; margin:16px auto 10px;
    border:1px solid var(--line); border-radius:2px; background:rgba(0,0,0,.35); }
  .covlog { color:var(--green); font-size:11.5px; line-height:1.65; text-align:left; width:100%; max-width:420px;
    min-height:120px; margin:0 auto; white-space:pre-wrap; word-break:break-word; text-shadow:0 0 6px rgba(61,247,107,.35); }
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
  .covfn { display:flex; background:#0c0a06; }
  .covfn .fk { flex:1; text-align:center; padding:7px 4px; font-size:10.5px; letter-spacing:1px;
    color:var(--dim); border-right:1px solid var(--line); white-space:nowrap; overflow:hidden; }
  .covfn .fk:last-child { border-right:none; }
  .covfn .fk b { color:#000; background:var(--amber); padding:0 4px; border-radius:1px; margin-right:5px; font-size:10px; }
  .covfn .fk.go { color:var(--amber); }
  @media (max-width:760px) {
    .covmain { grid-template-columns:1fr; }
    .covside { display:none; }
    .covfn .fk.opt { display:none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .coverscan::after, .covbrand, .coventer.show, .covtapetrack, .ptitle .live::before, .covkbd .klbl { animation:none; }
  }
</style>
</head>
<body>
  <div class="cover" id="cover" aria-hidden="true">
    <canvas class="coverfx" id="coverfx"></canvas>
    <div class="covkbd">${covKbd}</div>
    <div class="covtop">
      <span><span class="dot">●&nbsp;●&nbsp;●</span>&nbsp;&nbsp;JUMPFIGURES&nbsp;TERMINAL</span>
      <span class="mid">MARKET&nbsp;INTELLIGENCE&nbsp;·&nbsp;SYSTEM&nbsp;BOOT</span>
      <span><span id="covclock">--:--:--</span>&nbsp;&nbsp;AINEWS&lt;GO&gt;</span>
    </div>
    <div class="covmain">
      <div class="covpanel covside">
        <div class="ptitle"><span>WORLD&nbsp;INDICES</span><span class="live">LIVE</span></div>
        <div class="qboard" id="covBoardL"></div>
      </div>
      <div class="covpanel covcenter">
        <div class="covbrand">JUMPFIGURES</div>
        <div class="covsub">▸ MARKET INTELLIGENCE TERMINAL</div>
        <canvas class="covchart" id="covchart"></canvas>
        <pre class="covlog" id="covlog"></pre>
        <div class="covbar"><i id="covbarfill"></i></div>
        <div class="coventer" id="coventer">▸ CLICK OR PRESS ENTER TO LAUNCH&nbsp;<span class="blink">▍</span></div>
      </div>
      <div class="covpanel covside">
        <div class="ptitle"><span>CRYPTO&nbsp;·&nbsp;FX&nbsp;·&nbsp;CMDTY</span><span class="live">LIVE</span></div>
        <div class="qboard" id="covBoardR"></div>
      </div>
    </div>
    <div class="covcmd"><span class="prompt">JUMPFIGURES&gt;</span> <span id="covcmdtext"></span><span class="blink">▍</span></div>
    <div class="covtape"><div class="covtapetrack">${covTape}</div></div>
    <div class="covfn">
      <span class="fk go"><b>F1</b>HELP</span>
      <span class="fk"><b>F2</b>NEWS</span>
      <span class="fk"><b>F3</b>MARKETS</span>
      <span class="fk opt"><b>F4</b>RESEARCH</span>
      <span class="fk opt"><b>F5</b>CALENDAR</span>
      <span class="fk opt"><b>F6</b>ALERTS</span>
      <span class="fk">MENU</span>
    </div>
    <div class="coverscan"></div>
  </div>
  <div class="chrome">
    <span><span class="dot">●&nbsp;●&nbsp;●</span>&nbsp;&nbsp;JUMPFIGURES&nbsp;TERMINAL</span>
    <span>AINEWS&lt;GO&gt;</span>
  </div>
  <div class="wrap">
    <div class="status">▸ LIVE · <span id="clock">--:--:--</span> · AUTO-REFRESH <b>5s</b> · ${order.length} SOURCES<span class="blink">&nbsp;▍</span></div>
    <h1>Jumpfigures — ${esc(dateStr)}</h1>
    <div class="meta">Generated ${now.toISOString()} · ${results.length} stories</div>
    <div class="sectiontabs" id="sectiontabs">
      <button class="sectiontab active" data-view="news" type="button">▸ NEWS</button>
      <button class="sectiontab" data-view="market" type="button">▸ MARKET</button>
    </div>

    <div id="newsView">
      <div class="newsmenu" id="newsmenu">
        <div class="newswrap">
          <button class="newsbtn" id="newsbtn" type="button">▸ CATEGORY <span class="caret">▾</span></button>
          <ul class="newslist" id="newslist" hidden>${items}</ul>
        </div>
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
    <div class="foot">JUMPFIGURES · powered by Gemini · ${order.map(esc).join(' · ')}</div>
  </div>
  <script>
    (function () {
      var SRC = ${order.length}, STO = ${results.length};

      // ---- intro cover: Bloomberg-style boot dashboard, then launch the terminal ----
      var cover = document.getElementById('cover');
      if (cover) {
        document.body.style.overflow = 'hidden';
        var raf = 0, raf2 = 0, timers = [];
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

        // (1) faint number-rain behind the panels
        var cv = document.getElementById('coverfx');
        if (cv && cv.getContext) {
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

        // (1b) live streaming candlestick chart — the centerpiece
        var chartCv = document.getElementById('covchart');
        if (chartCv && chartCv.getContext) {
          var cc = chartCv.getContext('2d');
          var dpr = window.devicePixelRatio || 1;
          var CW = 0, CH = 0, cwd = 9, gapX = 5, maxN = 0;
          var candles = [], price = 5421, vel = 0, mid = 5421, lastCommit = 0;
          var GRN = '#16d672', RED = '#ff3b3b';
          function tickPrice() {
            vel += (Math.random() - 0.5) * 2.4;
            vel += (mid - price) * 0.0016;
            vel *= 0.9;
            price += vel;
          }
          function newCandle() { return { o: price, h: price, l: price, c: price }; }
          function feed(cnd) { cnd.c = price; if (price > cnd.h) cnd.h = price; if (price < cnd.l) cnd.l = price; }
          function chsz() {
            CW = chartCv.clientWidth || 460;
            CH = chartCv.clientHeight || 130;
            chartCv.width = Math.round(CW * dpr);
            chartCv.height = Math.round(CH * dpr);
            cc.setTransform(dpr, 0, 0, dpr, 0, 0);
            maxN = Math.floor(CW / (cwd + gapX)) + 1;
            if (!candles.length) {
              for (var i = 0; i < maxN; i++) {
                var cnd = newCandle();
                for (var k = 0; k < 9; k++) { tickPrice(); feed(cnd); }
                candles.push(cnd);
              }
            }
          }
          chsz();
          window.addEventListener('resize', chsz);
          function drawChart(ts) {
            ts = ts || 0;
            tickPrice();
            feed(candles[candles.length - 1]);
            if (!lastCommit) lastCommit = ts;
            if (ts - lastCommit > 600) {
              lastCommit = ts;
              candles.push(newCandle());
              while (candles.length > maxN) candles.shift();
            }
            var lo = Infinity, hi = -Infinity;
            for (var i = 0; i < candles.length; i++) {
              if (candles[i].l < lo) lo = candles[i].l;
              if (candles[i].h > hi) hi = candles[i].h;
            }
            var pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
            function yOf(p) { return CH - ((p - lo) / (hi - lo)) * CH; }
            cc.clearRect(0, 0, CW, CH);
            cc.strokeStyle = 'rgba(255,160,40,0.07)'; cc.lineWidth = 1;
            for (var g = 1; g < 4; g++) { var gy = (CH / 4) * g; cc.beginPath(); cc.moveTo(0, gy); cc.lineTo(CW, gy); cc.stroke(); }
            for (var j = 0; j < candles.length; j++) {
              var k = candles[j];
              var x = j * (cwd + gapX) + 1;
              var up = k.c >= k.o;
              var col = up ? GRN : RED;
              cc.strokeStyle = col; cc.fillStyle = col;
              var xc = x + cwd / 2;
              cc.beginPath(); cc.moveTo(xc + 0.5, yOf(k.h)); cc.lineTo(xc + 0.5, yOf(k.l)); cc.stroke();
              var yo = yOf(k.o), ycl = yOf(k.c);
              var top = Math.min(yo, ycl), hgt = Math.max(2, Math.abs(yo - ycl));
              cc.fillRect(x, top, cwd, hgt);
            }
            var last = candles[candles.length - 1];
            var lastUp = last.c >= last.o;
            cc.font = 'bold 11px monospace'; cc.textBaseline = 'top';
            cc.textAlign = 'left'; cc.fillStyle = '#9a7b3f'; cc.fillText('SPX · LIVE', 5, 5);
            cc.textAlign = 'right'; cc.fillStyle = lastUp ? GRN : RED;
            cc.fillText(price.toLocaleString('en-US', { maximumFractionDigits: 2 }) + (lastUp ? '  \\u25B2' : '  \\u25BC'), CW - 5, 5);
            cc.textAlign = 'left';
            if (!reduce) raf2 = window.requestAnimationFrame(drawChart);
          }
          if (reduce) drawChart(0); else raf2 = window.requestAnimationFrame(drawChart);
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
        buildBoard('covBoardL', [
          ['S&P 500', 5431.20, 2], ['NASDAQ', 17680.40, 2], ['DOW', 38900.10, 2],
          ['RUSSELL', 2030.50, 2], ['VIX', 13.42, 2], ['FTSE 100', 8240.30, 2],
          ['DAX', 18500.20, 2], ['NIKKEI', 39100.00, 2], ['HANG SENG', 18900.00, 2],
          ['US 10Y', 4.282, 3]
        ]);
        buildBoard('covBoardR', [
          ['BTC', 65120, 0], ['ETH', 3420, 0], ['SOL', 152.30, 2], ['XRP', 0.5230, 4],
          ['EUR/USD', 1.0850, 4], ['USD/JPY', 157.20, 2], ['GBP/USD', 1.2710, 4],
          ['GOLD', 2332.40, 2], ['WTI', 78.40, 2], ['NAT GAS', 2.85, 2]
        ]);
        var tickT = setInterval(function () {
          if (!allRows.length) return;
          for (var k = 0; k < 3; k++) {
            var s = allRows[Math.floor(Math.random() * allRows.length)];
            var step = Math.random() * 0.6 - 0.3;
            s.price = Math.max(0.0001, s.price * (1 + step / 100));
            s.chg += step;
            paintRow(s);
            s.row.classList.add('flash');
            (function (el) { later(function () { el.classList.remove('flash'); }, 240); })(s.row);
          }
        }, 700);
        timers.push(tickT);

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
        var clog = document.getElementById('covlog');
        var cbar = document.getElementById('covbarfill');
        var center = document.getElementById('coventer');
        var lines = [
          '> INITIALIZING JUMPFIGURES CORE ...',
          '> ESTABLISHING MARKET DATA LINK ......... OK',
          '> SYNCING ' + SRC + ' NEWS SOURCES ............ OK',
          '> LOADING GEMINI INTELLIGENCE ENGINE .... OK',
          '> INDEXING ' + STO + ' STORIES ................ OK',
          '> RENDERING TERMINAL INTERFACE .......... OK',
          '> ALL SYSTEMS NOMINAL'
        ];
        var li = 0, buf = '', launched = false, autoT = 0;
        function launch() {
          if (launched) return;
          launched = true;
          for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
          clearInterval(tickT); clearInterval(clockT); clearTimeout(autoT);
          cover.classList.add('gone');
          document.body.style.overflow = '';
          setTimeout(function () {
            if (raf) window.cancelAnimationFrame(raf);
            if (raf2) window.cancelAnimationFrame(raf2);
            cover.style.display = 'none';
          }, 750);
        }
        function step() {
          if (li < lines.length) {
            buf += (li ? '\\n' : '') + lines[li];
            li++;
            if (clog) clog.textContent = buf;
            if (cbar) cbar.style.width = Math.round((li / lines.length) * 100) + '%';
            later(step, 320);
          } else {
            if (center) center.classList.add('show');
            autoT = setTimeout(launch, 3000);
          }
        }
        cover.addEventListener('click', launch);
        document.addEventListener('keydown', function (e) {
          if (!launched && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) launch();
        });
        later(step, 700);
      }

      var menu = document.getElementById('newsmenu');
      if (!menu) return;
      menu.style.display = 'block'; // reveal only when JS runs (website, not email)
      var btn = document.getElementById('newsbtn');
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
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        list.hidden = !list.hidden;
      });
      for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function () {
          for (var j = 0; j < items.length; j++) items[j].classList.remove('active');
          this.classList.add('active');
          filter(this.getAttribute('data-cat'));
          list.hidden = true;
        });
      }
      document.addEventListener('click', function () { list.hidden = true; });

      // Section tabs: NEWS / MARKET (revealed only on the website).
      var sectiontabs = document.getElementById('sectiontabs');
      var newsView = document.getElementById('newsView');
      var marketView = document.getElementById('marketView');
      sectiontabs.style.display = 'flex';
      var sectBtns = sectiontabs.querySelectorAll('.sectiontab');
      var marketLoaded = false;
      function showView(view) {
        for (var i = 0; i < sectBtns.length; i++) {
          sectBtns[i].classList.toggle('active', sectBtns[i].getAttribute('data-view') === view);
        }
        newsView.hidden = view !== 'news';
        marketView.hidden = view !== 'market';
        if (view === 'market' && !marketLoaded) { loadMarket(); marketLoaded = true; }
      }
      for (var i = 0; i < sectBtns.length; i++) {
        sectBtns[i].addEventListener('click', function () { showView(this.getAttribute('data-view')); });
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
        '<div class="rpanel"><div class="rphead"><span>■ ARTICLE READER · JUMPFIGURES</span>' +
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

      // Auto-refresh: every 5s check (in the background) whether new content was
      // published; reload only when it actually changed — keeps the page always
      // fresh without flicker. Paused while reading, in a menu, or on MARKET.
      var stampEl = document.querySelector('.meta');
      var stamp = stampEl ? stampEl.textContent : '';
      setInterval(function () {
        if (document.hidden || !list.hidden || !marketView.hidden || reader.classList.contains('open')) return;
        fetch(window.location.href, { cache: 'no-store' })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var m = html.match(/<div class="meta">([^<]*)<\\/div>/);
            if (m && stamp && m[1] !== stamp) window.location.reload();
          })
          .catch(function () {});
      }, 5000);
    })();
  </script>
</body>
</html>`;
}

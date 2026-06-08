import { marked } from 'marked';

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
  const CAT_ORDER = ['Markets', 'Economy', 'Politics', 'Technology', 'Crypto', 'Business', 'World'];
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
    .map(({ article, summary, category }) => {
      const cat = category || 'World';
      const title = article.link
        ? `<a href="${esc(article.link)}" target="_blank" rel="noopener">${esc(article.title)}</a>`
        : esc(article.title);
      const img = article.image
        ? `<img class="thumb" src="${esc(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : '';
      const summaryHtml = colorFields(marked.parse(summary));
      return `      <article class="card" data-cat="${esc(cat)}">
        <h2>${title}</h2>
        <div class="srcline"><span class="f f-cat">${esc(cat.toUpperCase())}</span> <span class="f f-src">SRC</span> ${esc(article.source)}</div>
        ${img}
        <div class="summary">${summaryHtml}</div>
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Jumpfigures Terminal — ${esc(dateStr)}</title>
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
  .mkthead { color:var(--amber2); font-size:13px; letter-spacing:1px; margin:0 0 10px; }
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
  .chartlabel { color:var(--amber2); font-size:12px; font-weight:bold; letter-spacing:1px; margin:2px 0 8px; }
  .chartbox { height:420px; margin:0; }
  .research { margin-top:24px; max-width:900px; }
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
</style>
</head>
<body>
  <div class="chrome">
    <span><span class="dot">●&nbsp;●&nbsp;●</span>&nbsp;&nbsp;JUMPFIGURES&nbsp;TERMINAL</span>
    <span>AINEWS&lt;GO&gt;</span>
  </div>
  <div class="wrap">
    <div class="status">▸ LIVE · <span id="clock">--:--:--</span> · AUTO-REFRESH <b>60s</b> · ${order.length} SOURCES<span class="blink">&nbsp;▍</span></div>
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
      <div class="mkthead">▸ LIVE MARKETS · stocks &amp; indices · crypto</div>
      <div id="tvHost"></div>
      <div class="research">
        <div class="mkthead">▸ STREET RESEARCH · what major institutions are saying</div>
        ${researchHtml}
      </div>
    </div>
    <div class="foot">JUMPFIGURES · powered by Gemini · ${order.map(esc).join(' · ')}</div>
  </div>
  <script>
    (function () {
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

      function addWidget(host, file, config) {
        var box = document.createElement('div');
        box.className = 'tradingview-widget-container';
        var inner = document.createElement('div');
        inner.className = 'tradingview-widget-container__widget';
        box.appendChild(inner);
        var s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/' + file;
        s.async = true;
        s.text = JSON.stringify(config);
        box.appendChild(s);
        host.appendChild(box);
      }
      // One chart per asset class, shown together as a grid.
      var PANELS = [
        { label: 'INDEX · S&P 500', sym: 'FOREXCOM:SPXUSD' },
        { label: 'CRYPTO · BITCOIN', sym: 'BINANCE:BTCUSDT' }
      ];

      function addChart(grid, label, symbol) {
        var cell = document.createElement('div');
        cell.className = 'chartcell';
        var head = document.createElement('div');
        head.className = 'chartlabel';
        head.textContent = label;
        cell.appendChild(head);
        var box = document.createElement('div');
        box.className = 'tradingview-widget-container chartbox';
        box.innerHTML = '<div class="tradingview-widget-container__widget" style="width:100%"></div>';
        var s = document.createElement('script');
        s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        s.async = true;
        s.text = JSON.stringify({
          width: '100%', height: 420, symbol: symbol, interval: 'D', timezone: 'Asia/Jakarta',
          theme: 'dark', style: '1', locale: 'en', allow_symbol_change: true,
          hide_side_toolbar: true, withdateranges: false, details: false, calendar: false,
          support_host: 'https://www.tradingview.com'
        });
        box.appendChild(s);
        cell.appendChild(box);
        grid.appendChild(cell);
      }

      function loadMarket() {
        var host = document.getElementById('tvHost');
        host.innerHTML = '';
        var grid = document.createElement('div');
        grid.className = 'chartgrid';
        host.appendChild(grid);
        for (var i = 0; i < PANELS.length; i++) addChart(grid, PANELS[i].label, PANELS[i].sym);
      }

      // Live clock + auto-refresh every 60s (website only; email ignores JS).
      // Skips reload when a menu is open, the tab is hidden, or MARKET is open.
      var clockEl = document.getElementById('clock');
      function tick() { if (clockEl) clockEl.textContent = new Date().toLocaleTimeString(); }
      tick();
      setInterval(tick, 1000);
      setInterval(function () {
        if (!document.hidden && list.hidden && marketView.hidden) location.reload();
      }, 60000);
    })();
  </script>
</body>
</html>`;
}

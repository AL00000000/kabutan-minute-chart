const state = {
  manifest: null,
  mode: "symbol", // "symbol" | "date"
  symbolCode: null,
  date: null,
  cache: new Map(), // "code|date" -> bars
};

const els = {
  modeSwitch: document.getElementById("mode-switch"),
  tabs: document.getElementById("tabs"),
  main: document.getElementById("main"),
};

async function loadManifest() {
  const res = await fetch("data/manifest.json", { cache: "no-store" });
  return res.json();
}

async function loadBars(code, date) {
  const key = `${code}|${date}`;
  if (state.cache.has(key)) return state.cache.get(key);
  const res = await fetch(`data/${code}/${date}.json`, { cache: "no-store" });
  if (!res.ok) return null;
  const bars = await res.json();
  state.cache.set(key, bars);
  return bars;
}

function fmtPrice(n) {
  return n.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtVolume(n) {
  return n.toLocaleString("ja-JP");
}

// Build an SVG candlestick+volume chart for one symbol/date.
function renderChart(bars, { width, height, showVolume }) {
  const padL = 54;
  const padR = 10;
  const padT = 10;
  const padB = 18;
  const volH = showVolume ? Math.round(height * 0.2) : 0;
  const priceH = height - padT - padB - volH - (showVolume ? 8 : 0);

  const n = bars.length;
  const innerW = width - padL - padR;
  const slot = innerW / n;
  const candleW = Math.max(1, Math.min(8, slot * 0.62));

  let priceMin = Infinity, priceMax = -Infinity, volMax = 0;
  for (const b of bars) {
    if (b.l < priceMin) priceMin = b.l;
    if (b.h > priceMax) priceMax = b.h;
    if (b.v > volMax) volMax = b.v;
  }
  const pad = (priceMax - priceMin) * 0.08 || priceMax * 0.005 || 1;
  priceMin -= pad;
  priceMax += pad;

  const y = (p) => padT + priceH * (1 - (p - priceMin) / (priceMax - priceMin));
  const x = (i) => padL + i * slot + slot / 2;

  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // price gridlines + labels (4 lines)
  const gridCount = 4;
  for (let g = 0; g <= gridCount; g++) {
    const p = priceMin + ((priceMax - priceMin) * g) / gridCount;
    const yy = y(p);
    svg += `<line class="axis-line" x1="${padL}" y1="${yy}" x2="${width - padR}" y2="${yy}" />`;
    svg += `<text x="${width - padR}" y="${yy - 3}" text-anchor="end">${fmtPrice(p)}</text>`;
  }

  // candles
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const cx = x(i);
    const up = b.c >= b.o;
    const color = up ? "var(--up)" : "var(--down)";
    const yHigh = y(b.h);
    const yLow = y(b.l);
    const yOpen = y(b.o);
    const yClose = y(b.c);
    svg += `<line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="1" />`;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH = Math.max(1, Math.abs(yClose - yOpen));
    svg += `<rect x="${cx - candleW / 2}" y="${bodyTop}" width="${candleW}" height="${bodyH}" fill="${color}" />`;
  }

  // volume
  if (showVolume && volMax > 0) {
    const volTop = padT + priceH + 8;
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const cx = x(i);
      const up = b.c >= b.o;
      const color = up ? "var(--up)" : "var(--down)";
      const h = (b.v / volMax) * volH;
      svg += `<rect x="${cx - candleW / 2}" y="${volTop + (volH - h)}" width="${candleW}" height="${h}" fill="${color}" opacity="0.5" />`;
    }
  }

  // x-axis time labels
  const tickCount = width < 500 ? 4 : 7;
  for (let t = 0; t <= tickCount; t++) {
    const idx = Math.min(n - 1, Math.round((n - 1) * (t / tickCount)));
    const cx = x(idx);
    svg += `<text x="${cx}" y="${height - 4}" text-anchor="middle">${bars[idx].t}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

function statsLine(bars) {
  const open = bars[0].o;
  const close = bars[bars.length - 1].c;
  let high = -Infinity, low = Infinity, vol = 0;
  for (const b of bars) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
    vol += 0; // volume field is cumulative already; use last bar's v
  }
  vol = bars[bars.length - 1].v;
  const chg = close - open;
  const chgPct = (chg / open) * 100;
  const cls = chg >= 0 ? "up" : "down";
  const sign = chg >= 0 ? "+" : "";
  return `始値 <b>${fmtPrice(open)}</b>　高値 <b>${fmtPrice(high)}</b>　安値 <b>${fmtPrice(low)}</b>　終値 <b>${fmtPrice(close)}</b>　` +
    `<span class="${cls}">${sign}${fmtPrice(chg)} (${sign}${chgPct.toFixed(2)}%)</span>　出来高 ${fmtVolume(vol)}`;
}

function symbolName(code) {
  const s = state.manifest.symbols.find((s) => s.code === code);
  return s ? s.name : code;
}

function setMode(mode) {
  state.mode = mode;
  [...els.modeSwitch.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  renderTabs();
  renderMain();
}

function renderTabs() {
  els.tabs.innerHTML = "";
  if (state.mode === "symbol") {
    for (const s of state.manifest.symbols) {
      const btn = document.createElement("button");
      btn.textContent = s.name;
      btn.className = s.code === state.symbolCode ? "active" : "";
      btn.addEventListener("click", () => {
        state.symbolCode = s.code;
        renderTabs();
        renderMain();
      });
      els.tabs.appendChild(btn);
    }
  } else {
    for (const d of state.manifest.dates) {
      const btn = document.createElement("button");
      btn.textContent = d;
      btn.className = d === state.date ? "active" : "";
      btn.addEventListener("click", () => {
        state.date = d;
        renderTabs();
        renderMain();
      });
      els.tabs.appendChild(btn);
    }
  }
}

async function renderMain() {
  els.main.innerHTML = "";

  if (!state.manifest.dates.length) {
    els.main.innerHTML = `<div class="empty">まだデータがありません。</div>`;
    return;
  }

  if (state.mode === "symbol") {
    const code = state.symbolCode;
    const recentDates = state.manifest.dates.slice(0, 5);
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "14px";

    for (const d of recentDates) {
      const bars = await loadBars(code, d);
      const card = document.createElement("div");
      card.className = "chart-card";
      if (!bars || !bars.length) {
        card.innerHTML = `<h2>${symbolName(code)}　${d}</h2><div class="empty">データがありません。</div>`;
      } else {
        card.innerHTML =
          `<h2>${symbolName(code)}　${d}</h2>` +
          `<div class="chart-stats">${statsLine(bars)}</div>` +
          renderChart(bars, { width: 900, height: 300, showVolume: true });
      }
      list.appendChild(card);
    }
    els.main.appendChild(list);
  } else {
    const date = state.date;
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const s of state.manifest.symbols) {
      const bars = await loadBars(s.code, date);
      const card = document.createElement("div");
      card.className = "chart-card";
      if (!bars || !bars.length) {
        card.innerHTML = `<h2>${s.name}</h2><div class="empty">データなし</div>`;
      } else {
        card.innerHTML =
          `<h2>${s.name}</h2>` +
          `<div class="chart-stats">${statsLine(bars)}</div>` +
          renderChart(bars, { width: 360, height: 220, showVolume: false });
      }
      grid.appendChild(card);
    }
    els.main.appendChild(grid);
  }
}

async function init() {
  state.manifest = await loadManifest();
  state.symbolCode = state.manifest.symbols[0]?.code ?? null;
  state.date = state.manifest.dates[0] ?? null;

  els.modeSwitch.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  renderTabs();
  renderMain();
}

init();

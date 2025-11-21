/* ============================================================
   API CONFIG – Your Lambda via API Gateway
============================================================ */

const API_URL = "https://c6e3ke1ckj.execute-api.ap-south-1.amazonaws.com/prod/stock";

/* ============================================================
   GLOBAL STATE
============================================================ */

let ALL_STOCKS_UI = [];
let stockDetailsSeries = null;
let stockDetailsPrice = null;

/* ============================================================
   SIMPLE API CALL (NO AUTH REQUIRED)
============================================================ */

async function callAPI(url, method = "GET", body = null) {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
    });

    if (!res.ok) {
      console.error("API HTTP ERROR:", res.status, res.statusText);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("API ERROR:", err);
    return null;
  }
}

/* ============================================================
   UI HELPERS
============================================================ */

function signalToAction(signal) {
  if (!signal) return "Hold";
  if (signal === "BUY") return "Buy";
  if (signal === "SELL") return "Sell";
  return "Hold";
}

function mapSummaryToUI(s) {
  return {
    name: s.name || s.symbol,
    symbol: s.symbol,
    price: s.price,
    changePct: s.change_pct,
    action: signalToAction(s.signal),
    logo: (s.symbol || "?")[0],
    logoUrl: s.logo_url || "",
    trendText: s.trend_text || "",
    shortMA: s.short_ma,
    longMA: s.long_ma,
  };
}

function generateCandleData(base, range = "1M") {
  const points = range === "1D" ? 16 : range === "1W" ? 7 : range === "1M" ? 30 : 60;
  const data = [];
  let last = base || 100;

  for (let i = 0; i < points; i++) {
    const open = last + (Math.random() - 0.5) * 3;
    const close = open + (Math.random() - 0.5) * 5;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    data.push({ time: i, open, high, low, close });
    last = close;
  }

  return data;
}

function generateDescription(stock) {
  if (!stock) return "--";
  if (stock.changePct > 1.5) return `${stock.name} is showing strong positive momentum today.`;
  if (stock.changePct < -1.5) return `${stock.name} is under selling pressure.`;
  if (stock.changePct > 0) return `${stock.name} is mildly positive.`;
  if (stock.changePct < 0) return `${stock.name} is slightly negative.`;
  return `${stock.name} is relatively stable today.`;
}

function makeRow(stock) {
  const el = document.createElement("div");
  el.className = "stock-row";
  el.onclick = () => {
    window.location.href = `stock.html?symbol=${encodeURIComponent(stock.symbol)}`;
  };

  el.innerHTML = `
    <div class="stock-left">
      ${
        stock.logoUrl
          ? `<img src="${stock.logoUrl}" class="stock-logo-img" onerror="this.style.display='none'">`
          : `<div class="stock-logo">${stock.logo}</div>`
      }
      <div class="stock-name-symbol">
        <div class="stock-name">${stock.name}</div>
        <div class="stock-symbol">${stock.symbol}</div>
      </div>
    </div>
    <div class="stock-right">
      <div class="stock-price">₹${stock.price.toFixed(2)}</div>
      <div class="stock-change" style="color:${stock.changePct >= 0 ? "#4ade80" : "#fb7185"}">
        ${stock.changePct}%
      </div>
    </div>`;

  return el;
}

function makeMiniRow(stock) {
  const el = document.createElement("div");
  el.className = "mini-row";
  el.onclick = () => {
    window.location.href = `stock.html?symbol=${encodeURIComponent(stock.symbol)}`;
  };

  el.innerHTML = `
    <div>${stock.name} (${stock.symbol})</div>
    <div style="color:${stock.changePct >= 0 ? "#4ade80" : "#fb7185"}">
      ${stock.changePct}%
    </div>`;

  return el;
}

/* ============================================================
   DASHBOARD LOGIC
============================================================ */

async function setupDashboard() {
  const data = await callAPI(API_URL);
  if (!data || !data.all_stocks) {
    console.error("No data from API for dashboard");
    return;
  }

  const allStocksRaw = data.all_stocks.filter(
    (s) => !s.error && typeof s.change_pct === "number"
  );

  const allStocks = allStocksRaw.map(mapSummaryToUI);
  ALL_STOCKS_UI = allStocks;

  const top5 = (data.top_5 || [])
    .filter((s) => !s.error && typeof s.change_pct === "number")
    .map(mapSummaryToUI);

  const bottom5 = (data.bottom_5 || [])
    .filter((s) => !s.error && typeof s.change_pct === "number")
    .map(mapSummaryToUI);

  if (!allStocks.length) {
    console.warn("No valid stocks to display");
    return;
  }

  const top = top5[0] || allStocks[0];

  const nameEl = document.getElementById("topStockName");
  const priceEl = document.getElementById("topStockPrice");
  const changeEl = document.getElementById("topStockChange");

  if (nameEl) nameEl.textContent = `${top.name} (${top.symbol})`;
  if (priceEl) priceEl.textContent = `₹${top.price.toFixed(2)}`;
  if (changeEl) {
    changeEl.textContent = `${top.changePct}%`;
    changeEl.classList.add(top.changePct >= 0 ? "badge-up" : "badge-down");
  }

  const listEl = document.getElementById("allStocksList");
  if (listEl) {
    listEl.innerHTML = "";
    allStocks.forEach((s) => listEl.appendChild(makeRow(s)));
  }

  const countEl = document.getElementById("stockCount");
  if (countEl) countEl.textContent = allStocks.length;

  const top5ListEl = document.getElementById("top5List");
  if (top5ListEl) {
    top5ListEl.innerHTML = "";
    top5.forEach((s) => top5ListEl.appendChild(makeMiniRow(s)));
  }

  const bottom5ListEl = document.getElementById("bottom5List");
  if (bottom5ListEl) {
    bottom5ListEl.innerHTML = "";
    bottom5.forEach((s) => bottom5ListEl.appendChild(makeMiniRow(s)));
  }

  const chartDiv = document.getElementById("mainChart");
  if (!chartDiv || typeof LightweightCharts === "undefined") return;

  const chart = LightweightCharts.createChart(chartDiv, {
    width: chartDiv.clientWidth,
    height: 230,
    layout: { background: { color: "#020617" }, textColor: "#ffffff" },
  });

  const series = chart.addCandlestickSeries({
    upColor: "#4ade80",
    downColor: "#fb7185",
    wickUpColor: "#4ade80",
    wickDownColor: "#fb7185",
    borderUpColor: "#4ade80",
    borderDownColor: "#fb7185",
  });

  if (data.leader_chart && data.leader_chart.timestamps) {
    const lc = data.leader_chart;
    const points = lc.timestamps.map((ts, i) => ({
      time: ts.substring(0, 10),
      open: lc.open[i],
      high: lc.high[i],
      low: lc.low[i],
      close: lc.close[i],
    }));
    series.setData(points);
  } else {
    series.setData(generateCandleData(top.price));
  }
}

/* ============================================================
   STOCK DETAILS PAGE
============================================================ */

async function setupStockDetails() {
  const symbol = new URLSearchParams(window.location.search).get("symbol");

  const nameEl = document.getElementById("detailsName");
  const skeletonEl = document.getElementById("loadingSkeleton");
  const gridEl = document.getElementById("detailsGrid");

  if (!symbol) {
    if (nameEl) nameEl.textContent = "No stock selected";
    if (skeletonEl) skeletonEl.style.display = "none";
    if (gridEl) gridEl.style.opacity = "1";
    return;
  }

  const data = await callAPI(API_URL);
  if (!data || !data.all_stocks) {
    console.error("No data from API for stock details");
    if (nameEl) nameEl.textContent = "Error loading stock";
    if (skeletonEl) skeletonEl.style.display = "none";
    if (gridEl) gridEl.style.opacity = "1";
    return;
  }

  const raw = data.all_stocks.find((x) => !x.error && x.symbol === symbol);

  if (!raw) {
    if (nameEl) nameEl.textContent = "Stock not found";
    if (skeletonEl) skeletonEl.style.display = "none";
    if (gridEl) gridEl.style.opacity = "1";
    return;
  }

  const stock = mapSummaryToUI(raw);
  stockDetailsPrice = stock.price;

  const symbolEl = document.getElementById("detailsSymbol");
  const priceEl = document.getElementById("detailsPrice");
  const changeEl = document.getElementById("detailsChange");
  const todayRangeEl = document.getElementById("detailsTodayRange");
  const range52El = document.getElementById("details52Range");
  const actionEl = document.getElementById("detailsAction");
  const descEl = document.getElementById("detailsDescription");

  if (nameEl) nameEl.textContent = stock.name;
  if (symbolEl) symbolEl.textContent = stock.symbol;
  if (priceEl) priceEl.textContent = `₹${stock.price.toFixed(2)}`;

  if (changeEl) {
    changeEl.textContent = `${stock.changePct}%`;
    changeEl.classList.add(stock.changePct >= 0 ? "badge-up" : "badge-down");
  }

  if (todayRangeEl) {
    if (typeof raw.low === "number" && typeof raw.high === "number") {
      todayRangeEl.textContent = `₹${raw.low.toFixed(2)} - ₹${raw.high.toFixed(2)}`;
    } else if (stock.price) {
      const low = stock.price * 0.97;
      const high = stock.price * 1.02;
      todayRangeEl.textContent = `₹${low.toFixed(2)} - ₹${high.toFixed(2)}`;
    } else {
      todayRangeEl.textContent = "--";
    }
  }

  if (range52El) {
    if (stock.longMA && stock.shortMA) {
      const low52 = Math.min(stock.longMA, stock.shortMA);
      const high52 = Math.max(stock.longMA, stock.shortMA);
      range52El.textContent = `₹${low52.toFixed(2)} - ₹${high52.toFixed(2)}`;
    } else if (stock.price) {
      const low = stock.price * 0.8;
      const high = stock.price * 1.3;
      range52El.textContent = `₹${low.toFixed(2)} - ₹${high.toFixed(2)}`;
    } else {
      range52El.textContent = "--";
    }
  }

  if (actionEl) actionEl.textContent = stock.action || "Hold";
  if (descEl) descEl.textContent = stock.trendText || generateDescription(stock);

  const chartDiv = document.getElementById("detailsChart");
  if (chartDiv && typeof LightweightCharts !== "undefined") {
    const chart = LightweightCharts.createChart(chartDiv, {
      width: chartDiv.clientWidth,
      height: 260,
      layout: { background: { color: "#020617" }, textColor: "#ffffff" },
    });

    stockDetailsSeries = chart.addCandlestickSeries({
      upColor: "#4ade80",
      downColor: "#fb7185",
      wickUpColor: "#4ade80",
      wickDownColor: "#fb7185",
      borderUpColor: "#4ade80",
      borderDownColor: "#fb7185",
    });

    if (data.leader_chart && data.leader_chart.symbol === stock.symbol) {
      const lc = data.leader_chart;
      const points = lc.timestamps.map((ts, i) => ({
        time: ts.substring(0, 10),
        open: lc.open[i],
        high: lc.high[i],
        low: lc.low[i],
        close: lc.close[i],
      }));
      stockDetailsSeries.setData(points);
    } else {
      stockDetailsSeries.setData(generateCandleData(stock.price));
    }
  }

  if (skeletonEl) skeletonEl.style.display = "none";
  if (gridEl) gridEl.style.opacity = "1";
}

function loadRange(range) {
  if (!stockDetailsSeries || !stockDetailsPrice) return;
  stockDetailsSeries.setData(generateCandleData(stockDetailsPrice, range));
}

/* ============================================================
   SEARCH BAR ON DASHBOARD
============================================================ */

function setupSearch() {
  const searchInput = document.getElementById("searchInput");
  const listEl = document.getElementById("allStocksList");
  const countEl = document.getElementById("stockCount");

  if (!searchInput || !listEl) return;

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase().trim();
    listEl.innerHTML = "";

    const filtered = !q
      ? ALL_STOCKS_UI
      : ALL_STOCKS_UI.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.symbol.toLowerCase().includes(q)
        );

    filtered.forEach((s) => listEl.appendChild(makeRow(s)));
    if (countEl) countEl.textContent = filtered.length;
  });
}

/* ============================================================
   PAGE ROUTER
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const page = window.location.pathname.split("/").pop();

  if (page === "dashboard.html") {
    setupDashboard();
    setupSearch();
  } else if (page === "stock.html") {
    setupStockDetails();
  }
});

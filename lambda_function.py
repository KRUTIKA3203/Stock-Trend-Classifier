import json
import urllib.request
import pandas as pd
import numpy as np

def lambda_handler(event, context):
    # EMERGENCY MODE: accept ANY token, skip Cognito validation
    print("Token accepted:", event.get("headers", {}).get("Authorization"))

# ---- CONFIG: Your 20 stocks ----
TICKERS = [
    "AAPL",  # Apple
    "MSFT",  # Microsoft
    "AMZN",  # Amazon
    "GOOGL", # Alphabet (Google)
    "META",  # Meta
    "TSLA",  # Tesla
    "NVDA",  # Nvidia
    "NFLX",  # Netflix
    "JPM",   # JPMorgan
    "BAC",   # Bank of America
    "WMT",   # Walmart
    "T",     # AT&T
    "V",     # Visa
    "MA",    # Mastercard
    "PEP",   # PepsiCo
    "KO",    # Coca-Cola
    "ORCL",  # Oracle
    "INTC",  # Intel
    "CSCO",  # Cisco
    "ADBE",  # Adobe
]

# Optional: company names for UI
COMPANY_NAMES = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "AMZN": "Amazon.com, Inc.",
    "GOOGL": "Alphabet Inc.",
    "META": "Meta Platforms, Inc.",
    "TSLA": "Tesla, Inc.",
    "NVDA": "NVIDIA Corporation",
    "NFLX": "Netflix, Inc.",
    "JPM": "JPMorgan Chase & Co.",
    "BAC": "Bank of America Corporation",
    "WMT": "Walmart Inc.",
    "T": "AT&T Inc.",
    "V": "Visa Inc.",
    "MA": "Mastercard Incorporated",
    "PEP": "PepsiCo, Inc.",
    "KO": "The Coca-Cola Company",
    "ORCL": "Oracle Corporation",
    "INTC": "Intel Corporation",
    "CSCO": "Cisco Systems, Inc.",
    "ADBE": "Adobe Inc.",
}

# Optional: logo URLs (you can show these in frontend)
LOGO_URLS = {
    "AAPL": "https://logo.clearbit.com/apple.com",
    "MSFT": "https://logo.clearbit.com/microsoft.com",
    "AMZN": "https://logo.clearbit.com/amazon.com",
    "GOOGL": "https://logo.clearbit.com/google.com",
    "META": "https://logo.clearbit.com/meta.com",
    "TSLA": "https://logo.clearbit.com/tesla.com",
    "NVDA": "https://logo.clearbit.com/nvidia.com",
    "NFLX": "https://logo.clearbit.com/netflix.com",
    "JPM": "https://logo.clearbit.com/jpmorganchase.com",
    "BAC": "https://logo.clearbit.com/bankofamerica.com",
    "WMT": "https://logo.clearbit.com/walmart.com",
    "T": "https://logo.clearbit.com/att.com",
    "V": "https://logo.clearbit.com/visa.com",
    "MA": "https://logo.clearbit.com/mastercard.com",
    "PEP": "https://logo.clearbit.com/pepsico.com",
    "KO": "https://logo.clearbit.com/coca-cola.com",
    "ORCL": "https://logo.clearbit.com/oracle.com",
    "INTC": "https://logo.clearbit.com/intel.com",
    "CSCO": "https://logo.clearbit.com/cisco.com",
    "ADBE": "https://logo.clearbit.com/adobe.com",
}


# ---- Helper: fetch historical data from Yahoo Finance (NO yfinance) ----
def get_stock_history(symbol, range_="1mo", interval="1d"):
    """
    Uses Yahoo Finance chart API:
    - range_: e.g. 5d, 1mo, 3mo
    - interval: e.g. 1d, 1h
    Returns a pandas DataFrame with OHLCV.
    """
    base_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    url = f"{base_url}?interval={interval}&range={range_}"

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}  # avoid 429/blocked requests
    )

    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode("utf-8"))

    result = data["chart"]["result"][0]
    timestamps = result["timestamp"]
    indicators = result["indicators"]["quote"][0]

    df = pd.DataFrame({
        "timestamp": pd.to_datetime(timestamps, unit="s"),
        "open": indicators["open"],
        "high": indicators["high"],
        "low": indicators["low"],
        "close": indicators["close"],
        "volume": indicators["volume"],
    })

    # Remove rows where close is NaN (sometimes last point is null)
    df = df.dropna(subset=["close"])

    return df


# ---- Helper: simple rule-based model (NO scikit) ----
def analyze_stock(symbol, df):
    """
    Creates a small 'model' using normal Python + pandas:
    - Uses last close vs previous close (1-day change)
    - Short SMA(5) vs Long SMA(20)
    - Outputs: BUY / SELL / HOLD
    """
    closes = df["close"].dropna()

    if len(closes) < 2:
        # Not enough data
        return None

    current_price = float(closes.iloc[-1])
    prev_price = float(closes.iloc[-2])
    change_pct = ((current_price - prev_price) / prev_price) * 100.0

    # Short / long moving average (fallback to all data if not enough points)
    if len(closes) >= 5:
        short_ma = float(closes.rolling(window=5).mean().iloc[-1])
    else:
        short_ma = float(closes.mean())

    if len(closes) >= 20:
        long_ma = float(closes.rolling(window=20).mean().iloc[-1])
    else:
        long_ma = float(closes.mean())

    # Simple rules:
    # - BUY: short MA above long MA, and price up at least 0.5%
    # - SELL: short MA below long MA, and price down at least -0.5%
    # - HOLD: otherwise
    if change_pct > 0.5 and short_ma > long_ma:
        signal = "BUY"
        trend_text = "Likely to go UP"
    elif change_pct < -0.5 and short_ma < long_ma:
        signal = "SELL"
        trend_text = "Likely to go DOWN"
    else:
        signal = "HOLD"
        trend_text = "Sideways / Unclear"

    info = {
        "symbol": symbol,
        "name": COMPANY_NAMES.get(symbol, symbol),
        "price": round(current_price, 2),
        "change_pct": round(change_pct, 2),
        "short_ma": round(short_ma, 2),
        "long_ma": round(long_ma, 2),
        "signal": signal,
        "trend_text": trend_text,
        "logo_url": LOGO_URLS.get(symbol),
    }

    return info


# ---- Helper: build chart data for one stock ----
def build_chart_payload(symbol, df, max_points=20):
    """
    Prepare last N points of chart data for the top stock.
    Frontend can use this to draw candlestick/line chart.
    """
    df_tail = df.tail(max_points)

    return {
        "symbol": symbol,
        "timestamps": [ts.isoformat() for ts in df_tail["timestamp"]],
        "close": [float(x) for x in df_tail["close"]],
        "open": [float(x) for x in df_tail["open"]],
        "high": [float(x) for x in df_tail["high"]],
        "low": [float(x) for x in df_tail["low"]],
        "volume": [int(x) for x in df_tail["volume"]],
    }


# ---- Main Lambda handler ----
def lambda_handler(event, context):
    all_summaries = []
    history_cache = {}  # symbol -> df (so we don't refetch for chart)

    for symbol in TICKERS:
        try:
            df = get_stock_history(symbol, range_="1mo", interval="1d")
            history_cache[symbol] = df
            info = analyze_stock(symbol, df)

            if info is not None:
                all_summaries.append(info)

        except Exception as e:
            # Skip errors for a stock, but log message in response for debugging
            all_summaries.append({
                "symbol": symbol,
                "error": str(e),
                "name": COMPANY_NAMES.get(symbol, symbol),
                "logo_url": LOGO_URLS.get(symbol),
            })

    # Filter out any items that don't have change_pct (i.e., error entries)
    valid_summaries = [s for s in all_summaries if "change_pct" in s]

    # Sort by 1-day % change
    sorted_by_change = sorted(valid_summaries, key=lambda x: x["change_pct"], reverse=True)

    top_5 = sorted_by_change[:5]
    bottom_5 = sorted_by_change[-5:] if len(sorted_by_change) >= 5 else sorted_by_change

    # Pick the top gainer for the main chart (if available)
    leader_chart = None
    if len(top_5) > 0:
        leader_symbol = top_5[0]["symbol"]
        leader_df = history_cache.get(leader_symbol)
        if leader_df is not None:
            leader_chart = build_chart_payload(leader_symbol, leader_df, max_points=20)

    response_payload = {
        "top_5": top_5,
        "bottom_5": bottom_5,
        "leader_chart": leader_chart,   # contains timestamps + OHLCV for one stock
        "all_stocks": all_summaries,    # includes errors if any, with symbol + error field
    }

    # Return as API Gateway compatible response
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            # CORS for your frontend:
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(response_payload, default=str)
    }

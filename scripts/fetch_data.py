import json
import time
import datetime
import sys
import csv
import math
import os
import concurrent.futures
from pathlib import Path
from io import StringIO
try:
    import yfinance as yf
except ImportError:
    print("Installing yfinance...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "yfinance", "requests"])
    import yfinance as yf
try:
    import pandas as pd
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "lxml", "html5lib"])
    import pandas as pd
import requests

# ── PATHS & YFINANCE THROTTLE (local networks) ──────────────────────────────────────────────────
SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
DATA_PATH = REPO_ROOT / 'public' / 'data.json'

def load_dotenv(path):
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip()
                    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                        v = v[1:-1]
                    if k:
                        if k not in os.environ:
                            os.environ[k] = v

load_dotenv(REPO_ROOT / '.env')
load_dotenv(REPO_ROOT / '.env.local')

# Smaller batches + pauses avoid Yahoo rate limits on local networks (see ROBUST_FETCHING.md).
YF_BATCH_SIZE = int(os.environ.get('YF_BATCH_SIZE', '25'))
YF_BATCH_PAUSE = float(os.environ.get('YF_BATCH_PAUSE', '1.0'))
YF_INFO_PAUSE = float(os.environ.get('YF_INFO_PAUSE', '0.3'))
YF_HOLDINGS_PAUSE = float(os.environ.get('YF_HOLDINGS_PAUSE', '0.4'))

# ── MASSIVE API CONFIG ─────────────────────────────────────────────────────────
MASSIVE_API_KEY = os.environ.get('MASSIVE_API_KEY', '')
MASSIVE_BASE    = 'https://api.massive.com'

SYMBOL_MAPS_PATH = REPO_ROOT / 'config' / 'symbolMaps.json'

def load_symbol_maps():
    if not SYMBOL_MAPS_PATH.exists():
        return {}
    with open(SYMBOL_MAPS_PATH, encoding='utf-8') as f:
        return json.load(f).get('symbols', {})

SYMBOL_MAPS = load_symbol_maps()
if SYMBOL_MAPS:
    print(f"\u2713 Loaded {len(SYMBOL_MAPS)} symbols from symbolMaps.json")

def massive_sym_for(yf_sym):
    return SYMBOL_MAPS.get(yf_sym, {}).get('massive', yf_sym)

# ── LOAD tickers.json (required) ────────────────────────────────────────────────────────────────
TICKERS_PATH = SCRIPTS_DIR / 'tickers.json'
if not TICKERS_PATH.exists():
    sys.exit('Error: scripts/tickers.json is required')
with open(TICKERS_PATH, encoding='utf-8') as f:
    CFG = json.load(f)
print(f"\u2713 Loaded tickers.json")

# output_key -> tickers.json key
BATCH_SECTIONS = [
    ('etfmain', 'etfmain'),
    ('submarket', 'submarket'),
    ('sector', 'sectors'),
    ('sectorew', 'sectors_ew'),
    ('thematic', 'thematic'),
    ('country', 'country'),
    ('crypto', 'crypto'),
    ('dxvix', 'dxvix'),
    ('futures', 'futures'),
    ('metals', 'metals'),
    ('commod', 'energy'),
]
INDIVIDUAL_SECTIONS = [
    ('global', 'global'),
]

PRICE_SECTIONS = [
    'futures', 'dxvix', 'crypto', 'metals', 'commod', 'yields',
    'global', 'etfmain', 'submarket', 'sector', 'sectorew', 'thematic', 'country',
]

def tickers_for(section_key):
    return CFG.get(section_key, [])

def yield_symbols():
    return list(CFG.get('fred_yields', {}).keys()) + tickers_for('yields')

YIELD_SYMS = yield_symbols()

# ── TICKER DISPLAY NAMES ───────────────────────────────────────────────────────────────────────────
def fetch_ticker_short_names(tickers, existing=None):
    """Map ticker -> yfinance shortName (fallback longName)."""
    names = {}
    preserved = set()
    if existing:
        for key in PRICE_SECTIONS:
            for rec in existing.get(key, []):
                sym = rec.get('sym')
                if sym and rec.get('name'):
                    preserved.add(sym)

    pending = []
    for sym in tickers:
        if sym in names or sym in preserved:
            continue
        pending.append(sym)

    if preserved:
        print(f"  Reusing {len(preserved)} names from existing data.json")
    if not pending:
        print("  All ticker names already present — skipping yfinance lookup")
        return names

    total = len(pending)
    for i, sym in enumerate(pending):
        print(f"  Names [{i+1}/{total}] {sym}...", end=' ')
        try:
            info = yf.Ticker(sym).info
            name = (info.get('shortName') or info.get('longName') or '').strip()
            if name:
                names[sym] = name
                label = name if len(name) <= 44 else name[:41] + '...'
                print(f"\u2713 {label}")
            else:
                print("\u2014")
        except Exception as e:
            print(f"\u2717 {e}")
        time.sleep(YF_INFO_PAUSE)

    return names

def apply_ticker_names(output, name_map, existing=None):
    """Attach yfinance names to price records; skip rows that already have a name."""
    preserved = {}
    if existing:
        for key in PRICE_SECTIONS:
            for rec in existing.get(key, []):
                sym = rec.get('sym')
                if sym and rec.get('name'):
                    preserved[sym] = rec['name']

    for key in PRICE_SECTIONS:
        for rec in output.get(key, []):
            if rec.get('name'):
                continue
            sym = rec.get('sym')
            if not sym:
                continue
            if sym in name_map:
                rec['name'] = name_map[sym]
            elif sym in preserved:
                rec['name'] = preserved[sym]

# ── MASSIVE API FETCH ─────────────────────────────────────────────────────────────────────────────────────
def fetch_massive_bars(yf_sym, days=400):
    """Fetch daily OHLCV bars from Massive API for one ticker. Returns DataFrame or None."""
    if not MASSIVE_API_KEY:
        return None
    end   = datetime.date.today()
    start = end - datetime.timedelta(days=days)
    # Determine Massive ticker symbol
    massive_sym = massive_sym_for(yf_sym)
    url    = f"{MASSIVE_BASE}/v2/aggs/ticker/{massive_sym}/range/1/day/{start}/{end}"
    params = {'adjusted': 'true', 'sort': 'asc', 'limit': 500, 'apiKey': MASSIVE_API_KEY}
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get('status') != 'OK' or not data.get('results'):
            return None
        df = pd.DataFrame(data['results'])
        df.index = pd.to_datetime(df['t'], unit='ms').dt.normalize()
        df.rename(columns={'c': 'Close', 'h': 'High', 'l': 'Low', 'o': 'Open', 'v': 'Volume'}, inplace=True)
        return df[['Open', 'High', 'Low', 'Close', 'Volume']]
    except Exception as e:
        print(f"  Massive fetch failed for {yf_sym}: {e}")
        return None

def fetch_batch_massive(tickers):
    """Fetch multiple tickers from Massive API concurrently."""
    results = {}
    def _fetch_one(sym):
        df = fetch_massive_bars(sym)
        if df is None or df.empty:
            return sym, None
        try:
            return sym, extract_metrics(df, sym)
        except Exception as e:
            print(f"  Error extracting {sym}: {e}")
            return sym, None
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_fetch_one, sym): sym for sym in tickers}
        for future in concurrent.futures.as_completed(futures):
            sym, rec = future.result()
            if rec:
                results[sym] = rec
                print(f"  ✓ {sym}: {rec['price']}")
            else:
                print(f"  ⚠ No data for {sym}")
    return results

# ── FRED YIELDS ───────────────────────────────────────────────────────────────────────────────────
def fetch_fred_yield(sym, series_id):
    try:
        url = f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}'
        resp = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
        resp.raise_for_status()
        reader = csv.reader(StringIO(resp.text))
        rows = list(reader)
        series_data = []
        for row in rows[1:]:
            if len(row) == 2 and row[1] not in ('.', '', 'VALUE'):
                try:
                    series_data.append((row[0], float(row[1])))
                except ValueError:
                    continue
        if series_data:
            dates = [d for d, r in series_data]
            rates = [r for d, r in series_data]
            price = rates[-1]
            d1 = round((rates[-1] - rates[-2]) * 100, 1) if len(rates) >= 2 else 0.0
            w1 = round((rates[-1] - rates[-6]) * 100, 1) if len(rates) >= 6 else 0.0
            hi_val = max(rates[-252:]) if len(rates) >= 252 else max(rates)
            hi52 = round((price - hi_val) * 100, 1)
            this_year = str(datetime.datetime.now().year)
            ytd_vals = [rates[i] for i in range(len(rates)) if dates[i].startswith(this_year)]
            ytd = round((price - ytd_vals[0]) * 100, 1) if ytd_vals else 0.0
            spark = []
            for i in range(max(1, len(rates) - 5), len(rates)):
                spark.append(round((rates[i] - rates[i-1]) * 100, 2))
            while len(spark) < 5:
                spark.insert(0, 0.0)

            print(f"  \u2713 {sym} = {price}% (FRED {series_id})")
            return {
                'sym': sym,
                'price': round(price, 4),
                'd1': d1,
                'w1': w1,
                'hi52': hi52,
                'ytd': ytd,
                'spark': spark,
            }
    except Exception as e:
        print(f"  FRED {series_id} failed: {e}")
    return None

def fetch_fred_yields():
    records = []
    for sym, series_id in CFG.get('fred_yields', {}).items():
        rec = fetch_fred_yield(sym, series_id)
        if rec:
            records.append(rec)
    return records

# ── MASSIVE TREASURY YIELDS ─────────────────────────────────────────────────────────────────────────────
def fetch_massive_treasury_yields():
    """Fetch full yield curve from Massive Economy API (/fed/v1/treasury-yields).
    Returns list of records for US2Y, US10Y, US30Y, or None on failure.
    """
    if not MASSIVE_API_KEY:
        return None
    url    = f"{MASSIVE_BASE}/fed/v1/treasury-yields"
    params = {'limit': 1000, 'sort': 'date.desc', 'apiKey': MASSIVE_API_KEY}
    try:
        r = requests.get(url, params=params, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
        r.raise_for_status()
        data = r.json()
        results = data.get('results', [])
        if not results:
            print(f"  Massive treasury yields: empty response (status={data.get('status')})")
            return None
        results.sort(key=lambda x: x.get('date', ''))

        maturity_map = CFG.get('massive_yield_symbols', {})
        maturities = [
            (['yield_2_year',  'rate_2_year',  'y2y',  'y2'],  maturity_map.get('2Y')),
            (['yield_10_year', 'rate_10_year', 'y10y', 'y10'], maturity_map.get('10Y')),
            (['yield_30_year', 'rate_30_year', 'y30y', 'y30'], maturity_map.get('30Y')),
        ]

        def _get(row, candidates):
            for f in candidates:
                v = row.get(f)
                if v is not None:
                    return float(v)
            return None

        yield_records = []
        for fields, sym in maturities:
            if not sym:
                continue
            series = [_get(r, fields) for r in results]
            series = [v for v in series if v is not None]
            if len(series) < 2:
                print(f"  ⚠ Massive yields: no data for {sym}")
                continue
            price    = series[-1]
            d1_bps   = round((series[-1] - series[-2]) * 100, 1)
            w1_bps   = round((series[-1] - series[-6]) * 100, 1) if len(series) >= 6 else 0.0
            hi_val   = max(series[-252:]) if len(series) >= 252 else max(series)
            hi52_bps = round((price - hi_val) * 100, 1)
            this_year = str(datetime.datetime.now().year)
            ytd_vals  = [_get(r, fields) for r in results if r.get('date', '').startswith(this_year)]
            ytd_vals  = [v for v in ytd_vals if v is not None]
            ytd_bps   = round((price - ytd_vals[0]) * 100, 1) if ytd_vals else 0.0
            spark_vals = []
            for i in range(max(1, len(series) - 5), len(series)):
                spark_vals.append(round((series[i] - series[i-1]) * 100, 2))
            while len(spark_vals) < 5:
                spark_vals.insert(0, 0.0)
            yield_records.append({
                'sym':   sym,
                'price': round(price, 4),
                'd1':    d1_bps,
                'w1':    w1_bps,
                'hi52':  hi52_bps,
                'ytd':   ytd_bps,
                'spark': spark_vals,
            })
            print(f"  \u2713 {sym}: {price:.4f}% (d1={d1_bps:+.1f}bps)")
        return yield_records if yield_records else None
    except Exception as e:
        print(f"  Massive treasury yields failed: {e}")
        return None

# ── ETF HOLDINGS ─────────────────────────────────────────────────────────────────────────────────────────
def _safe_float(val):
    """Convert val to float, return None if NaN/invalid."""
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except Exception:
        return None

def _pct_from_val(val):
    """Convert a weight value to percentage. Handles both decimal (0.07) and % (7.0) formats."""
    f = _safe_float(val)
    if f is None or f == 0:
        return 0.0
    if 0 < f <= 1.0:
        return round(f * 100, 2)
    return round(f, 2)

def fetch_etf_holdings(tickers):
    holdings_map = {}
    total = len(tickers)

    for i, sym in enumerate(tickers):
        print(f"  Holdings [{i+1}/{total}] {sym}...", end=' ')
        try:
            t = yf.Ticker(sym)
            rows = []

            # ── Method 1: funds_data.top_holdings ────────────────────────────
            try:
                fd = t.funds_data
                if fd is not None:
                    th = fd.top_holdings
                    if th is not None and hasattr(th, 'iterrows') and not th.empty:

                        for idx, row in th.head(10).iterrows():
                            # Index = ticker symbol; Name column = company name
                            s = str(idx).strip() if str(idx) not in ('', 'nan') else ''
                            n = ''
                            if 'Name' in row.index:
                                v = str(row['Name']).strip()
                                if v and v != 'nan':
                                    n = v
                            if not n:
                                n = s
                            w = 0.0

                            # Try known weight column names
                            for pct_col in ['Holding Percent', 'holdingPercent', 'holdingpercent',
                                            '% Assets', 'weight', 'Weight', 'percent', 'Percent']:
                                if pct_col in row.index:
                                    w = _pct_from_val(row[pct_col])
                                    break

                            # Fallback: grab first non-zero numeric column
                            if w == 0.0:
                                for col_name in row.index:
                                    if col_name in ('symbol', 'Symbol', 'ticker',
                                                    'holdingName', 'name', 'Name'):
                                        continue
                                    f = _safe_float(row[col_name])
                                    if f and f > 0:
                                        w = _pct_from_val(f)
                                        break

                            if n or s:
                                rows.append({'s': s, 'n': n, 'w': w})
            except Exception as e:
                print(f"(funds_data err: {e})", end=' ')

            # ── Method 2: info['holdings'] fallback ──────────────────────────
            if not rows:
                try:
                    info = t.info
                    for h in info.get('holdings', [])[:10]:
                        s = str(h.get('symbol', ''))
                        n = str(h.get('holdingName', s))
                        w = _pct_from_val(h.get('holdingPercent', 0))
                        rows.append({'s': s, 'n': n, 'w': w})
                except Exception as e:
                    print(f"(info err: {e})", end=' ')

            if rows:
                holdings_map[sym] = rows
                w_sample = [r['w'] for r in rows[:3]]
                print(f"\u2713 {len(rows)} holdings (w={w_sample})")
            else:
                print("\u2014")

        except Exception as e:
            print(f"\u2717 {e}")

        time.sleep(YF_HOLDINGS_PAUSE)

    return holdings_map

# ── CORE METRICS ──────────────────────────────────────────────────────────────────────────────────────────────────
def pct(new, old):
    if old and old != 0:
        return round((new - old) / abs(old) * 100, 2)
    return 0.0

def _calc_ema(closes, period):
    """Exponential moving average seeded with SMA of first `period` values."""
    closes = list(closes)
    if len(closes) < period:
        return closes[-1] if closes else 0.0
    k = 2.0 / (period + 1)
    ema = sum(closes[:period]) / period
    for c in closes[period:]:
        ema = float(c) * k + ema * (1.0 - k)
    return ema

def fetch_individual(tickers, retries=2):
    """Fetch tickers one-by-one via Ticker.history(). More reliable than batch
    download for international indices where yf.download() can return stale data."""
    results = {}
    for sym in tickers:
        for attempt in range(retries):
            try:
                ticker = yf.Ticker(sym)
                df = ticker.history(period='1y', interval='1d', auto_adjust=True)
                if df is not None and not df.empty:
                    meta = getattr(ticker, 'history_metadata', None)
                    results[sym] = extract_metrics(df, sym, metadata=meta)
                break
            except Exception as e:
                print(f"  Attempt {attempt+1} failed for {sym}: {e}")
                time.sleep(2)
        time.sleep(0.3)
    return results

def _fetch_batch_chunk(tickers, retries=3):
    """Download one chunk of tickers (single-threaded, with retry/backoff)."""
    results = {}
    if not tickers:
        return results

    data = None
    for attempt in range(retries):
        try:
            data = yf.download(tickers, period='1y', interval='1d',
                               group_by='ticker', auto_adjust=True,
                               progress=False, threads=False)
            break
        except Exception as e:
            print(f"attempt {attempt+1} failed: {e}", end=' ')
            wait_time = 2 ** (attempt + 1)
            time.sleep(wait_time)
    else:
        print(f"failed after {retries} attempts")
        return results

    if len(tickers) == 1:
        sym = tickers[0]
        try:
            results[sym] = extract_metrics(data, sym)
        except Exception as e:
            print(f"extract {sym}: {e}", end=' ')
        return results

    for sym in tickers:
        try:
            if sym in data.columns.get_level_values(0):
                df = data[sym].dropna()
            elif hasattr(data, 'columns') and sym in data:
                df = data[sym].dropna()
            else:
                continue
            results[sym] = extract_metrics(df, sym)
        except Exception as e:
            print(f"extract {sym}: {e}", end=' ')
    return results

def fetch_batch(tickers, retries=3):
    """Fetch price metrics in small chunks to avoid Yahoo rate limits locally."""
    if len(tickers) <= YF_BATCH_SIZE:
        return _fetch_batch_chunk(tickers, retries)

    results = {}
    chunks = [tickers[i:i + YF_BATCH_SIZE] for i in range(0, len(tickers), YF_BATCH_SIZE)]
    for idx, chunk in enumerate(chunks, 1):
        print(f"  Chunk {idx}/{len(chunks)} ({len(chunk)} tickers)...", end=' ')
        chunk_results = _fetch_batch_chunk(chunk, retries)
        results.update(chunk_results)
        print(f"\u2713 {len(chunk_results)}/{len(chunk)}")
        if idx < len(chunks):
            time.sleep(YF_BATCH_PAUSE)
    return results

def extract_metrics(df, sym, metadata=None, yield_syms=None):
    df = df.dropna(subset=['Close'])
    if len(df) < 2:
        return None
    closes = df['Close'].values
    price  = float(closes[-1])

    yield_set = set(yield_syms if yield_syms is not None else YIELD_SYMS)
    is_yield = sym in yield_set

    if is_yield:
        d1     = round((closes[-1] - closes[-2]) * 100, 1) if len(closes) >= 2 else 0.0
        w1     = round((closes[-1] - closes[-6]) * 100, 1) if len(closes) >= 6 else 0.0
        hi52_price = float(df['High'].max()) if 'High' in df else price
        hi52_pct   = round((price - hi52_price) * 100, 1)
        this_year  = datetime.datetime.now().year
        ytd_df     = df[df.index.year == this_year]
        ytd        = round((price - float(ytd_df['Close'].iloc[0])) * 100, 1) if len(ytd_df) > 0 else 0.0
        spark = []
        for i in range(max(1, len(closes)-5), len(closes)):
            spark.append(round((closes[i] - closes[i-1]) * 100, 2))
    else:
        d1     = pct(closes[-1], closes[-2]) if len(closes) >= 2 else 0.0
        w1     = pct(closes[-1], closes[-6]) if len(closes) >= 6 else 0.0
        hi52_price = float(df['High'].max()) if 'High' in df else price
        hi52_pct   = pct(price, hi52_price)
        this_year  = datetime.datetime.now().year
        ytd_df     = df[df.index.year == this_year]
        ytd        = pct(price, float(ytd_df['Close'].iloc[0])) if len(ytd_df) > 0 else 0.0
        spark = []
        for i in range(max(1, len(closes)-5), len(closes)):
            spark.append(round(pct(closes[i], closes[i-1]), 2))

    while len(spark) < 5:
        spark.insert(0, 0.0)
    # 10-EMA vs 20-EMA uptrend signal
    ema_uptrend = None
    if len(closes) >= 20:
        ema10 = _calc_ema(closes, 10)
        ema20 = _calc_ema(closes, 20)
        ema_uptrend = bool(ema10 > ema20)

    updated_at = None
    if metadata and isinstance(metadata, dict) and 'regularMarketTime' in metadata:
        updated_at = int(metadata['regularMarketTime'] * 1000)

    if updated_at is None:
        try:
            is_crypto = sym.endswith('-USD')
            if is_crypto:
                # Crypto is open 24/7, so the fetched price represents the current real-time timestamp.
                updated_at = int(time.time() * 1000)
            else:
                last_dt = df.index[-1]
                last_date = last_dt.date()
                current_date = datetime.datetime.now(last_dt.tz).date() if last_dt.tz else datetime.datetime.utcnow().date()
                # If the last candle represents today, it is still active/live.
                # Use current timestamp instead of the daily candle's midnight start time.
                if last_date == current_date:
                    updated_at = int(time.time() * 1000)
                else:
                    updated_at = int(last_dt.timestamp() * 1000)
        except Exception:
            pass

    result = {
        'sym':   sym,
        'price': round(price, 4),
        'd1':    d1,
        'w1':    w1,
        'hi52':  hi52_pct,
        'ytd':   ytd,
        'spark': spark,
    }
    if updated_at is not None:
        result['updatedAt'] = updated_at
    if ema_uptrend is not None:
        result['ema_uptrend'] = ema_uptrend
    return result

# ── FEAR & GREED ──────────────────────────────────────────────────────────────────────────────────
def fetch_fear_greed():
    """Fetch CNN Fear & Greed Index score and rating."""
    urls = [
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        "https://fear-and-greed-index.p.rapidapi.com/v1/fgi",  # fallback (may 401)
    ]
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://edition.cnn.com/',
    }
    try:
        r = requests.get(urls[0], timeout=15, headers=headers)
        print(f"  Fear & Greed HTTP {r.status_code}")
        r.raise_for_status()
        data = r.json()
        fg = data.get('fear_and_greed', {})
        score  = round(float(fg.get('score', 50)), 1)
        rating = fg.get('rating', 'neutral').replace('_', ' ').title()
        print(f"  ✓ Fear & Greed: {score} ({rating})")
        return {'score': score, 'rating': rating}
    except Exception as e:
        print(f"  ⚠ Fear & Greed fetch failed: {e}")
        return None

# ── NAAIM EXPOSURE INDEX ────────────────────────────────────────────────────────────────────────────
def fetch_naaim():
    """Scrape NAAIM Exposure Index — latest weekly reading."""
    try:
        from bs4 import BeautifulSoup
        url = "https://www.naaim.org/programs/naaim-exposure-index/"
        r = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        table = soup.find('table')
        if not table:
            raise ValueError("No table found on NAAIM page")
        rows = table.find_all('tr')
        for row in rows[1:]:  # skip header row
            cells = [td.get_text(strip=True) for td in row.find_all('td')]
            if len(cells) >= 2:
                for cell in cells[1:]:  # second column onwards is typically the exposure value
                    try:
                        val = float(cell.replace(',', ''))
                        if -200 <= val <= 300:
                            date_str = cells[0]
                            print(f"  ✓ NAAIM: {val:.1f}% ({date_str})")
                            return {'value': round(val, 1), 'date': date_str}
                    except ValueError:
                        continue
        raise ValueError("Could not parse NAAIM exposure value from table")
    except Exception as e:
        print(f"  ⚠ NAAIM fetch failed: {e}")
        return None

# ── S&P 500 BREADTH COMPUTATION ──────────────────────────────────────────────────────────────────────
def compute_sp500_breadth():
    """Download S&P 500 component data and compute breadth metrics with robust retry logic."""
    try:
        from bs4 import BeautifulSoup
        import time
        
        # Get S&P 500 component list from Wikipedia using built-in html.parser
        print("  Fetching S&P 500 component list...")
        r = requests.get('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
                         timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        table = soup.find('table', {'id': 'constituents'})
        if not table:
            table = soup.find('table')
        tickers = []
        for row in table.find_all('tr')[1:]:
            cells = row.find_all('td')
            if cells:
                tickers.append(cells[0].get_text(strip=True).replace('.', '-'))
        if not tickers:
            raise ValueError("No tickers found in Wikipedia table")
        
        print(f"  Downloading {len(tickers)} tickers in batches (1 year of daily closes)...")
        
        # Download in batches with retry logic (much more robust for local networks)
        batch_size = 50  # Download 50 at a time instead of all 503
        max_retries = 3
        all_data = {}
        failed_tickers = set()
        
        for batch_idx in range(0, len(tickers), batch_size):
            batch = tickers[batch_idx:batch_idx + batch_size]
            batch_num = batch_idx // batch_size + 1
            total_batches = (len(tickers) + batch_size - 1) // batch_size
            
            print(f"    Batch {batch_num}/{total_batches}: {len(batch)} tickers...", end=" ")
            
            # Retry logic for this batch
            for attempt in range(max_retries):
                try:
                    raw = yf.download(batch, period='1y', interval='1d',
                                     auto_adjust=True, progress=False, 
                                     threads=False)  # Single-threaded, much more reliable
                    
                    if isinstance(raw.columns, pd.MultiIndex):
                        all_data.update(raw['Close'].to_dict('series'))
                    else:
                        all_data[batch[0]] = raw
                    
                    print("✓")
                    break
                    
                except Exception as e:
                    if attempt < max_retries - 1:
                        # Exponential backoff: 2s, 4s, 8s
                        wait_time = 2 ** (attempt + 1)
                        print(f"\n      Retry in {wait_time}s... (attempt {attempt + 2}/{max_retries})", end="")
                        time.sleep(wait_time)
                    else:
                        print(f"✗ (failed after {max_retries} attempts)")
                        failed_tickers.update(batch)
        
        if not all_data:
            raise ValueError("No data returned from any batch")
        
        # Convert to DataFrame
        close = pd.DataFrame(all_data)
        close = close.dropna(axis=1, how='all')
        
        if len(close) < 5:
            raise ValueError(f"Not enough trading days in data (got {len(close)})")
        
        # If we have some data, work with what we got
        if len(close.columns) < 50:
            print(f"  ⚠ Warning: Only got {len(close.columns)} tickers (partial data)")
        
        # Advancers / Decliners — compare each ticker's last two actual trading
        # closes (not shared calendar rows). On weekends yfinance often leaves
        # the latest session NaN for some symbols; ffill would make last == prev.
        changes = []
        for col in close.columns:
            valid = close[col].dropna()
            if len(valid) >= 2:
                changes.append(valid.iloc[-1] - valid.iloc[-2])
        advancers = sum(1 for c in changes if c > 0)
        decliners = sum(1 for c in changes if c < 0)
        print(f"  A/D: {advancers} adv / {decliners} dec ({len(changes)} tickers)")
        
        close = close.ffill()
        last = close.apply(lambda s: s.dropna().iloc[-1] if s.dropna().size else pd.NA)
        
        # New 52-week Highs / Lows (within 1% of extreme)
        window = close.iloc[-252:] if len(close) >= 252 else close
        hi52 = window.max()
        lo52 = window.min()
        new_highs = int((last >= hi52 * 0.99).sum())
        new_lows  = int((last <= lo52 * 1.01).sum())
        print(f"  NH/NL: {new_highs} highs / {new_lows} lows")
        
        # % of stocks above SMA 20, 50, 200
        def pct_above(n):
            if len(close) < n:
                return 0.0
            sma = close.rolling(n).mean().iloc[-1]
            valid = sma.dropna()
            if valid.empty:
                return 0.0
            return round(float((last[valid.index] > valid).sum()) / len(valid) * 100, 1)
        
        p20  = pct_above(20)
        p50  = pct_above(50)
        p200 = pct_above(200)
        print(f"  % above SMA: 20={p20}% | 50={p50}% | 200={p200}%")
        
        if failed_tickers:
            print(f"  ⚠ {len(failed_tickers)} tickers failed (network issues)")
        
        return {
            'advance_decline': {'advancers': advancers, 'decliners': decliners},
            'new_high_low':    {'new_highs': new_highs, 'new_lows': new_lows},
            'pct_above_sma20':  p20,
            'pct_above_sma50':  p50,
            'pct_above_sma200': p200,
        }
    except Exception as e:
        print(f"  ⚠ S&P 500 breadth failed: {e}")
        return None

# ── BREADTH WRAPPER ──────────────────────────────────────────────────────────────────────────────────
def fetch_breadth():
    """Fetch all market breadth & sentiment indicators."""
    print("\nFetching market breadth & sentiment...")
    fg = fetch_fear_greed()
    nm = fetch_naaim()
    sp = compute_sp500_breadth()
    result = {
        'fear_greed': fg,
        'naaim':      nm,
        'advance_decline':  sp.get('advance_decline')  if sp else None,
        'new_high_low':     sp.get('new_high_low')     if sp else None,
        'pct_above_sma20':  sp.get('pct_above_sma20')  if sp else None,
        'pct_above_sma50':  sp.get('pct_above_sma50')  if sp else None,
        'pct_above_sma200': sp.get('pct_above_sma200') if sp else None,
    }
    return result

# ── MAIN FETCH ──────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_all(prices_only=False):
    # Always load existing data.json so we can fall back to it if the API fails
    existing = {}
    out_path = DATA_PATH
    if out_path.exists():
        try:
            with open(out_path) as f:
                existing = json.load(f)
            print(f"✓ Loaded existing data.json (fallback if API fails)")
        except Exception as e:
            print(f"⚠ Could not load existing data.json: {e}")

    output = {
        'generated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'futures':  [], 'dxvix':   [], 'metals':   [], 'commod':  [],
        'yields':   [], 'global':  [], 'etfmain':  [], 'submarket':[],
        'sector':   [], 'sectorew':[], 'thematic': [], 'country': [],
        'crypto':   [],
        'holdings': existing.get('holdings', {}),
        'breadth':  existing.get('breadth',  {}),
    }

    # US ETF + market sections via yfinance batch download
    yf_etf_batches = [(out_key, tickers_key) for out_key, tickers_key in BATCH_SECTIONS
                      if out_key in ('etfmain', 'submarket', 'sector', 'sectorew', 'thematic', 'country')]
    yf_batches = [(out_key, tickers_key) for out_key, tickers_key in BATCH_SECTIONS
                  if out_key not in ('etfmain', 'submarket', 'sector', 'sectorew', 'thematic', 'country')]
    yf_individual_batches = INDIVIDUAL_SECTIONS

    use_massive = bool(MASSIVE_API_KEY)
    if prices_only:
        if use_massive:
            print(f"Prices-only mode — using yfinance (Massive API for treasury yields)")
        else:
            print(f"Prices-only mode — using yfinance")
    elif use_massive:
        print(f"✓ MASSIVE_API_KEY found — using Massive API for treasury yields only")
    else:
        print(f"⚠ MASSIVE_API_KEY not set — all data via yfinance")

    # Fetch global indices individually (batch download returns stale data for non-US indices)
    for out_key, tickers_key in yf_individual_batches:
        tickers = tickers_for(tickers_key)
        print(f"Fetching {out_key} ({len(tickers)} tickers) via yfinance (individual)...")
        raw = fetch_individual(tickers)
        for sym in tickers:
            rec = raw.get(sym)
            if rec:
                output[out_key].append(rec)
            else:
                print(f"  \u26a0 No data for {sym}")

    # Fetch all other price sections via yfinance batch download
    for out_key, tickers_key in yf_etf_batches + yf_batches:
        tickers = tickers_for(tickers_key)
        print(f"Fetching {out_key} ({len(tickers)} tickers) via yfinance...")
        raw = fetch_batch(tickers)
        for sym in tickers:
            rec = raw.get(sym)
            if rec:
                output[out_key].append(rec)
            else:
                print(f"  \u26a0 No data for {sym}")
        time.sleep(1)

    # Treasury yields: Massive Economy API (full curve) with yfinance + FRED fallback
    print("Fetching treasury yields...")
    yield_records = fetch_massive_treasury_yields() if use_massive else None
    if yield_records:
        output['yields'] = yield_records
    else:
        print("  \u26a0 Massive yields unavailable \u2014 falling back to yfinance + FRED")
        yf_yields = tickers_for('yields')
        raw = fetch_batch(yf_yields)
        for sym in yf_yields:
            rec = raw.get(sym)
            if rec:
                output['yields'].append(rec)
        output['yields'] = fetch_fred_yields() + output['yields']

    # Preserve tickers.json order for dxvix
    if output['dxvix']:
        dx_order = {sym: idx for idx, sym in enumerate(tickers_for('dxvix'))}
        output['dxvix'].sort(key=lambda x: dx_order.get(x.get('sym', ''), 99))

    for key in ('country', 'sector', 'sectorew', 'thematic', 'submarket'):
        output[key].sort(key=lambda x: x.get('w1', 0), reverse=True)

    all_price_tickers = list(dict.fromkeys(
        [sym for _, tickers_key in BATCH_SECTIONS + INDIVIDUAL_SECTIONS for sym in tickers_for(tickers_key)] +
        list(CFG.get('fred_yields', {}).keys())
    ))
    print(f"\nFetching ticker names ({len(all_price_tickers)} symbols)...")
    name_map = fetch_ticker_short_names(all_price_tickers, existing)
    apply_ticker_names(output, name_map, existing)
    print(f"\u2713 Names attached for {len(name_map)} symbols")

    # If any section came back empty (API failure), preserve existing data
    # rather than overwriting with empty arrays.
    if existing:
        massive_sections = ['etfmain', 'submarket', 'sector', 'sectorew',
                            'thematic', 'country', 'crypto', 'global', 'yields']
        for key in massive_sections:
            if not output.get(key) and existing.get(key):
                output[key] = existing[key]
                print(f"  \u26a0 {key}: no data returned \u2014 preserving existing values")
        # dxvix: restore VIX from existing if it's missing from this run
        dxvix_tickers = tickers_for('dxvix')
        vix_sym = dxvix_tickers[1] if len(dxvix_tickers) > 1 else None
        vix_in_output = any(r.get('sym') == vix_sym for r in output.get('dxvix', [])) if vix_sym else True
        if not vix_in_output and existing.get('dxvix') and vix_sym:
            vix_rec = next((r for r in existing['dxvix'] if r.get('sym') == vix_sym), None)
            if vix_rec:
                output['dxvix'].append(vix_rec)
                dx_order = {sym: idx for idx, sym in enumerate(dxvix_tickers)}
                output['dxvix'].sort(key=lambda x: dx_order.get(x.get('sym', ''), 99))
                print(f"  \u26a0 dxvix/{vix_sym}: no data returned \u2014 preserving existing value")

    if not prices_only:
        holdings_tickers = list(dict.fromkeys(
            [sym for out_key, tickers_key in BATCH_SECTIONS
             if out_key in ('etfmain', 'submarket', 'sector', 'sectorew', 'thematic', 'country')
             for sym in tickers_for(tickers_key)]
        ))
        print(f"\nFetching ETF holdings ({len(holdings_tickers)} ETFs)...")
        output['holdings'] = fetch_etf_holdings(holdings_tickers)
        print(f"\u2713 Holdings fetched for {len(output['holdings'])} ETFs")

        output['breadth'] = fetch_breadth()
        print(f"\u2713 Breadth data fetched")
    else:
        print("\nPrices-only mode \u2014 skipping holdings & breadth (preserved from last full run)")

    return output

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Market Dashboard Data Fetcher')
    parser.add_argument('--prices-only', action='store_true',
                        help='Refresh prices only; skip holdings & breadth (for intraday runs)')
    args = parser.parse_args()

    mode = 'PRICES ONLY' if args.prices_only else 'FULL RUN'
    print(f"=== Market Dashboard Data Fetch [{mode}] ===")
    print(f"Time: {datetime.datetime.utcnow()} UTC\n")
    data = fetch_all(prices_only=args.prices_only)
    out_path = DATA_PATH
    out_path.parent.mkdir(exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)
    total = sum(len(v) for v in data.values() if isinstance(v, list))
    print(f"\n\u2713 Wrote {total} records to {out_path}")
    print(f"  Yields: {[x['sym'] for x in data['yields']]}")
    print(f"  Thematic top 3: {[x['sym'] for x in data['thematic'][:3]]}")
    print(f"  Holdings for: {list(data['holdings'].keys())[:5]}...")

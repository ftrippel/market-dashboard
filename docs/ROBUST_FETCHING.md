# Robust Local Fetching

The fetch script is tuned for local networks where Yahoo Finance rate-limits parallel requests.

## What Changed

### 1. Chunked price downloads (`fetch_batch`)

Large sections (e.g. 80+ thematic ETFs) are downloaded in chunks of **25** (configurable), not all at once:

```python
YF_BATCH_SIZE=25   # default
YF_BATCH_PAUSE=1.0 # pause between chunks
```

Uses `threads=False` (single-threaded) with exponential backoff on retry (2s → 4s → 8s).

### 2. S&P 500 breadth

Breadth still downloads ~503 tickers in batches of 50 with the same retry/backoff pattern.

### 3. Throttled `.info` lookups

Ticker display names and ETF holdings use sequential requests with pauses:

```bash
YF_INFO_PAUSE=0.3       # shortName lookup
YF_HOLDINGS_PAUSE=0.4   # top-10 holdings
```

Names skip symbols that already have a `name` in `public/data.json`.

## Local usage

```bash
# First time / normal
./fetch-data.sh

# Faster refresh (skips holdings + breadth)
./fetch-data.sh --prices-only

# Still hitting rate limits?
rm -rf ~/.cache/yfinance
YF_BATCH_SIZE=15 YF_BATCH_PAUSE=2 YF_INFO_PAUSE=0.5 ./fetch-data.sh
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `YF_BATCH_SIZE` | 25 | Tickers per `yf.download` chunk |
| `YF_BATCH_PAUSE` | 1.0 | Seconds between chunks |
| `YF_INFO_PAUSE` | 0.3 | Seconds between name lookups |
| `YF_HOLDINGS_PAUSE` | 0.4 | Seconds between holdings lookups |
| `MASSIVE_API_KEY` | — | Optional treasury yield API |

GitHub Actions uses the same script; the runner network is typically more permissive than home ISPs.

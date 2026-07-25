# Backend API

The market dashboard keeps its React application on GitHub Pages and uses a
separate Hono application on Cloudflare Workers for operations that cannot run
reliably in a browser. The Worker handles Yahoo Finance metadata and chart
requests so the production frontend does not depend on a public CORS proxy.

## Configuration

The frontend reads the backend origin from `VITE_BACKEND_API_URL`:

```dotenv
VITE_BACKEND_API_URL=https://market-dashboard-api.florian-trippel.workers.dev
```

The value is an origin without `/api/v1`. The frontend API client appends the
versioned route prefix. If the value is absent, backend-powered metadata is
skipped and Yahoo chart requests use the public CORS-proxy fallback.

For local backend development:

```bash
npm run dev:backend
```

Wrangler serves the Worker locally. Set the frontend variable to the printed
Worker origin while running the Vite development server separately.

## Implemented routes

### `GET /api/v1/health`

Returns the service status.

### `GET /api/v1/instruments?symbols=AAPL,MSFT`

Returns display metadata for up to 25 comma-separated Yahoo Finance symbols.
The lookup is batched through `yahoo-finance2`, canonicalized for caching, and
limited to the fields the browser needs. ETF results also include their current
top-ten holdings so symbols added only to a watchlist can use the same Holdings
flyover as ETFs in the generated dashboard data.

Successful responses use a shared envelope:

```json
{
  "data": {
    "instruments": [
      {
        "symbol": "AAPL",
        "displayName": "Apple Inc.",
        "shortName": "Apple Inc.",
        "longName": "Apple Inc.",
        "type": "EQUITY",
        "exchange": "NMS"
      }
    ],
    "missingSymbols": []
  },
  "meta": {
    "requestId": "..."
  }
}
```

Errors use `{ "error": { "code", "message", "details?" }, "meta": { ... } }`.

### `GET /api/v1/charts/:symbol?interval=1d&range=1y`

Returns the Yahoo chart timestamps, OHLCV arrays, and quote metadata required by
the frontend. Supported intervals are `1m` and `1d`; supported ranges are `1d`,
`1y`, and `2y`.

See [Caching](#caching) for the chart cache durations and configuration.

## Caching

The backend uses two distinct cache layers:

1. The Cloudflare Worker Cache API reduces requests from the Worker to Yahoo.
2. HTTP `Cache-Control` headers determine whether callers such as browsers or
   shared proxies may reuse a response.

### Worker Cache API

| Data | Fresh for | Retained for stale fallback | Configuration |
|---|---:|---:|---|
| One-minute charts (`interval=1m`) | 15 seconds | 15 minutes | `LIVE_FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/charts.ts` |
| Daily charts (`interval=1d`) | 60 seconds | 15 minutes | `DAILY_FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/charts.ts` |
| Complete instrument metadata results | 24 hours | 7 days | `FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/instruments.ts` |
| Instrument results containing missing symbols | Effectively 5 minutes | No longer available after eviction | `NEGATIVE_CACHE_SECONDS` in `backend/src/routes/instruments.ts` |

When an entry is fresh, the Worker returns it without requesting Yahoo. After
the fresh period, the Worker requests updated data synchronously. A successful
request replaces the cached entry. If Yahoo fails, the Worker returns the old
entry while it is still retained; otherwise the request fails normally.

Chart entries are keyed by symbol, interval, and range. Instrument entries are
keyed by the sorted set of requested symbols, so different symbol combinations
have separate entries.

The `X-Cache` response header describes the Worker Cache API result:

- `HIT`: a fresh cached entry was returned
- `MISS`: no entry existed and Yahoo was queried
- `REFRESH`: an expired-freshness entry was successfully replaced
- `STALE`: Yahoo failed and the retained old entry was returned

### Browser and shared HTTP caching

| Endpoint | Response header | Configuration |
|---|---|---|
| `/api/v1/charts/:symbol` | `Cache-Control: no-store` | `backend/src/routes/charts.ts` |
| `/api/v1/instruments` | `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | `backend/src/routes/instruments.ts` |

Chart responses are therefore never cached by the browser. Instrument responses
may be cached by a browser for 1 hour, by a shared cache for 24 hours, and served
stale while being revalidated for up to 7 days.

## Future route conventions

New capabilities belong under `/api/v1` and should use plural resource names:

- `/api/v1/quotes?symbols=...` for quote snapshots
- `/api/v1/search?q=...` for instrument discovery

These routes are intentionally not registered until implemented. Route modules
belong in `backend/src/routes`, upstream integrations in
`backend/src/services`, and browser/server contracts in `shared/api`.

## Deployment

The `Deploy Backend` GitHub Actions workflow requires:

- `CLOUDFLARE_API_TOKEN`, scoped to edit Workers
- `CLOUDFLARE_ACCOUNT_ID`

For a local deployment, copy `.env.example` to `.env`, set the same two
variables, and run:

```bash
npm run deploy:backend
```

This command type-checks the backend and then uses the repository's installed
Wrangler version to load `.env`, build, bundle, and deploy the Worker.

The Worker origin is set directly as `VITE_BACKEND_API_URL` in the existing
GitHub Pages workflow and is baked into the Vite build.

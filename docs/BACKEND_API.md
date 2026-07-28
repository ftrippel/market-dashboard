# Backend API

The market dashboard deploys its React application and Hono API together on
Cloudflare Workers. Static assets are served directly by Cloudflare while
`/api/*` requests run the Worker application. GitHub Pages remains a second
frontend host and calls the public Worker API.

## Configuration

Frontend configuration uses Vite environment variables. Vite substitutes every
`VITE_*` value while building the browser bundle, so changing one requires a new
frontend build:

```dotenv
VITE_BACKEND_API_URL=https://market-dashboard.florian-trippel.workers.dev
```

The value is an origin without `/api/v1`. The frontend API client appends the
versioned route prefix. A root-path production build automatically uses its own
origin when the value is absent; this is the Cloudflare deployment. Other
builds skip backend-powered metadata and use the public CORS-proxy fallback
when the value is absent.

The Worker reads its CORS allowlist from the `ALLOWED_ORIGINS` runtime binding:

```dotenv
ALLOWED_ORIGINS=https://stockmarket-dashboard.com,https://ftrippel.github.io,http://localhost:5173
```

Values must be complete origins without paths or trailing slashes. Same-origin
requests are always accepted and do not have to be listed. When the binding is
absent, only `http://localhost:5173` and `http://127.0.0.1:5173` are accepted as
cross-origin callers.

For local backend development:

```bash
npm run dev:backend
```

This builds the root-hosted frontend and starts Wrangler with both static assets
and API routes. To run Vite separately, set `VITE_BACKEND_API_URL` to the
printed Worker origin.

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

### `GET /api/v1/quotes?symbols=AAPL,MSFT`

Returns current regular-session price, previous close, and market timestamp for
up to 25 Yahoo Finance symbols. The frontend and scheduled Python refresh use
these snapshots for the displayed price and `1D%`; daily charts remain the
source for longer-period metrics.

### `GET /api/v1/charts/:symbol?interval=1d&range=1y`

Returns the Yahoo chart timestamps, OHLCV arrays, and quote metadata required by
the frontend. Supported intervals are `1m` and `1d`; supported ranges are `1d`,
`1y`, and `2y`.

See [Caching](#caching) for the chart cache durations and configuration.

## Caching

The application uses three distinct cache layers:

1. Cloudflare Workers Static Assets caches the frontend globally.
2. The Cloudflare Worker Cache API reduces requests from the Worker to Yahoo.
3. HTTP `Cache-Control` headers determine whether callers such as browsers or
   shared proxies may reuse a response.

### Frontend static assets

Vite's content-hashed files under `/assets/*` are browser-cacheable for one
year and marked immutable. `index.html` and `data.json` must revalidate on each
use, with content-based ETags avoiding unnecessary downloads when they have not
changed. Each deployment attaches the complete static asset manifest to the
same Worker version as the API.

### Backend Worker Cache API

| Data | Fresh for | Retained for stale fallback | Configuration |
|---|---:|---:|---|
| One-minute charts (`interval=1m`) | 15 seconds | 15 minutes | `LIVE_FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/charts.ts` |
| Daily charts (`interval=1d`) | 60 seconds | 15 minutes | `DAILY_FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/charts.ts` |
| Batch quote snapshots | 15 seconds | 15 minutes | `FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/quotes.ts` |
| Complete instrument metadata results | 24 hours | 7 days | `FRESH_CACHE_MS` and `STALE_CACHE_SECONDS` in `backend/src/routes/instruments.ts` |
| Instrument results containing missing symbols | Effectively 5 minutes | No longer available after eviction | `NEGATIVE_CACHE_SECONDS` in `backend/src/routes/instruments.ts` |

When an entry is fresh, the Worker returns it without requesting Yahoo. After
the fresh period, the Worker requests updated data synchronously. A successful
request replaces the cached entry. If Yahoo fails, the Worker returns the old
entry while it is still retained; otherwise the request fails normally.

Chart entries are keyed by symbol, interval, and range. Quote and instrument
entries are keyed by the sorted set of requested symbols, so different symbol
combinations have separate entries.

The `X-Cache` response header describes the Worker Cache API result:

- `HIT`: a fresh cached entry was returned
- `MISS`: no entry existed and Yahoo was queried
- `REFRESH`: an expired-freshness entry was successfully replaced
- `STALE`: Yahoo failed and the retained old entry was returned

### Browser and shared HTTP caching

| Endpoint | Response header | Configuration |
|---|---|---|
| `/api/v1/charts/:symbol` | `Cache-Control: no-store` | `backend/src/routes/charts.ts` |
| `/api/v1/quotes` | `Cache-Control: no-store` | `backend/src/routes/quotes.ts` |
| `/api/v1/instruments` | `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800` | `backend/src/routes/instruments.ts` |

Chart responses are therefore never cached by the browser. Instrument responses
may be cached by a browser for 1 hour, by a shared cache for 24 hours, and served
stale while being revalidated for up to 7 days.

## Future route conventions

New capabilities belong under `/api/v1` and should use plural resource names:

- `/api/v1/search?q=...` for instrument discovery

These routes are intentionally not registered until implemented. Route modules
belong in `backend/src/routes`, upstream integrations in
`backend/src/services`, and browser/server contracts in `shared/api`.

## Deployment

The `Deploy Frontend and Worker` GitHub Actions workflow requires:

- GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN`, scoped to edit Workers
  - `CLOUDFLARE_ACCOUNT_ID`
- GitHub Actions repository variables:
  - `VITE_BACKEND_API_URL`
  - `ALLOWED_ORIGINS`
- Optional GitHub Actions repository variables:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_LIVE_DATA_REFRESH_MS`
  - `VITE_LIVE_DATA_IDLE_RETRY_MS`
  - `VITE_ENABLE_BUILD_VERSION_CHECK`

The `VITE_*` values are public browser configuration and belong in repository
variables, not secrets. `ALLOWED_ORIGINS` is also non-sensitive configuration.
The workflow passes it to `wrangler deploy --var`, which attaches it to the
deployed Worker as a runtime binding. Firebase configuration is optional, but
the workflow requires either all six Firebase variables or none of them.

For a local deployment, copy `.env.example` to `.env`, set the same two
Cloudflare credentials, set `ALLOWED_ORIGINS`, and run:

```bash
npm run deploy:backend
```

The preferred command name is `npm run deploy:cloudflare`;
`npm run deploy:backend` remains an alias. It type-checks both applications and
then uses the repository's installed Wrangler version to load `.env`, pass the
CORS allowlist as a Worker binding, build, bundle, and deploy the frontend
assets and API together.

The Cloudflare build uses its own origin automatically. The Worker origin is
set through the `VITE_BACKEND_API_URL` repository variable in the GitHub Pages
build.

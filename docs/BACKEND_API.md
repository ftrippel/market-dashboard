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

The Worker caches live one-minute data for 15 seconds and daily history for 60
seconds. Browser responses use `Cache-Control: no-store`, so freshness is
controlled in one place by the Worker. If Yahoo temporarily fails, cached chart
data can be served stale for up to 15 minutes. The `X-Cache` response header
reports `HIT`, `MISS`, `REFRESH`, or `STALE`.

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

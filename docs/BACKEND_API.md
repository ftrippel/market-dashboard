# Backend API

The market dashboard keeps its React application on GitHub Pages and uses a
separate Hono application on Cloudflare Workers for operations that cannot run
in a browser. Yahoo Finance lookups are the first such operation because
`yahoo-finance2` requires a server or edge runtime.

## Configuration

The frontend reads the backend origin from `VITE_BACKEND_API_URL`:

```dotenv
VITE_BACKEND_API_URL=https://market-dashboard-api.florian-trippel.workers.dev
```

The value is an origin without `/api/v1`. The frontend API client appends the
versioned route prefix. If the value is absent, backend-powered enhancements
are skipped and the watchlist continues to fall back to its existing symbols.

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
limited to the fields the browser needs.

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

## Future route conventions

New capabilities belong under `/api/v1` and should use plural resource names:

- `/api/v1/quotes?symbols=...` for quote snapshots
- `/api/v1/charts/:symbol?range=...&interval=...` for historical chart data
- `/api/v1/search?q=...` for instrument discovery

These routes are intentionally not registered until implemented. Route modules
belong in `backend/src/routes`, upstream integrations in
`backend/src/services`, and browser/server contracts in `shared/api`.

## Deployment

The `Deploy Backend` GitHub Actions workflow requires:

- `CLOUDFLARE_API_TOKEN`, scoped to edit Workers
- `CLOUDFLARE_ACCOUNT_ID`

The Worker origin is set directly as `VITE_BACKEND_API_URL` in the existing
GitHub Pages workflow and is baked into the Vite build.

# Market Dashboard

A React dashboard for futures, equities, commodities, market breadth, and a position calculator.

Live versions:

- Cloudflare Worker: [https://market-dashboard.florian-trippel.workers.dev](https://market-dashboard.florian-trippel.workers.dev)
- GitHub Pages fallback: [https://ftrippel.github.io/market-dashboard](https://ftrippel.github.io/market-dashboard)

React rewrite of the original [market-dashboard](https://github.com/clementang17-alt/market-dashboard) by [Clement Ang](https://github.com/clementang17-alt/market-dashboard).

**Stack:** React 19, TypeScript, Zustand, Vite

The versioned Hono API and React frontend are deployed together on Cloudflare
Workers. GitHub Pages remains a second frontend host and calls the same API. See
[`docs/BACKEND_API.md`](docs/BACKEND_API.md).

## Data flow

Market data is fetched by a Python script from yfinance, FRED, and optionally the Massive API, then written to `public/data.json`. In production, GitHub Actions runs this fetch **every 6 hours** (00:00, 06:00, 12:00, and 18:00 UTC), commits the updated file, and triggers a redeploy. The React app loads that JSON, transforms it, and stores it in Zustand for the UI.

```
  yfinance · FRED · Massive API (optional)
                    │
                    ▼
         scripts/fetch_data.py
         (./fetch-data.sh locally)
                    │
                    ▼
           public/data.json
                    │
    ┌───────────────┴───────────────┐
    │                               │
    ▼                               ▼
 GitHub Actions                 Local dev
 every 6 hours              ./fetch-data.sh
 commit → deploy                    │
    │                               │
    └───────────────┬───────────────┘
                    ▼
         React app (fetch + transform)
                    │
                    ▼
            Zustand store → UI
```

The browser reloads `data.json` on page load and every hour while the tab is open, so it picks up new data after each scheduled fetch without a full page refresh.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ (recommended)
- [npm](https://www.npmjs.com/)

To fetch fresh market data locally, you also need [uv](https://docs.astral.sh/uv/getting-started/) (Python package manager).

## Installation

```bash
git clone https://github.com/ftrippel/market-dashboard.git
cd market-dashboard
npm install
```

## Development

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The app reads `public/data.json`. A committed copy is included so you can run the dashboard without fetching data first.

### Fetch market data (optional)

To regenerate `public/data.json` locally:

```bash
cp .env.example .env   # optional: set MASSIVE_API_KEY for extended data
./fetch-data.sh
```

`MASSIVE_API_KEY` is optional. Without it, the fetch script uses yfinance and FRED. See `.env.example` for optional rate-limit tuning variables.

Useful flags:

```bash
./fetch-data.sh --prices-only
YF_BATCH_SIZE=15 YF_BATCH_PAUSE=2 ./fetch-data.sh
```

### Cloud settings sync (optional)

Sign in with Google to sync dashboard settings and watchlists across devices via Firebase.

1. Create a [Firebase project](https://console.firebase.google.com/) and add a Web app.
2. Enable **Authentication → Sign-in method → Google**.
3. Create a **Firestore** database.
4. Deploy `firestore.rules` from this repo (each user can only access their own settings). Redeploy
   these rules after sync updates: they reject stale writes from older app builds once a current build
   has connected.
5. Copy the Firebase web config into `.env`:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Settings are stored per user in Firestore as separate documents under `users/{uid}/settings/` (`preferences`, `calculator`, `watchlists`) and sync in real time across devices.

6. Add your dev and production domains under **Authentication → Settings → Authorized domains** (e.g. `localhost`, `ftrippel.github.io`, `market-dashboard.florian-trippel.workers.dev`, and `stockmarket-dashboard.com`).

Without these variables, the dashboard works as before with local storage and JSON export/import only.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:backend` | Build and start the full-stack Cloudflare Worker locally |
| `npm run build` | Type-check and build for GitHub Pages |
| `npm run build:cloudflare` | Type-check and build the root-hosted Worker frontend |
| `npm run build:backend` | Type-check the Worker backend |
| `npm run deploy:cloudflare` | Build and deploy the frontend and API with Wrangler |
| `npm run deploy:backend` | Compatibility alias for `deploy:cloudflare` |
| `npm run preview` | Preview production build locally |
| `npm run preview:pages` | Preview with GitHub Pages base path |
| `npm run verify:dist` | Build and verify `dist/` output |
| `npm run lint` | Run oxlint |

## Deployment

After each 6-hour data fetch (or any push to `main`), the deployment workflow
builds both hosting variants:

- Cloudflare serves the React assets at `/` and runs Hono for `/api/*`.
- GitHub Pages serves the same frontend from `/market-dashboard/` and uses the
  public Worker API URL.

The numeric build identifier is the Unix timestamp of the code deployment
workflow. Data-only refreshes retain the latest code build identifier; it
advances only for a push or manual code deployment.

To deploy the Cloudflare Worker locally, copy the example environment file and
set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and the comma-separated
`ALLOWED_ORIGINS` CORS allowlist:

```bash
cp .env.example .env
npm run deploy:cloudflare
```

This command type-checks both applications, builds the root-hosted frontend,
and lets the project-local Wrangler installation deploy the frontend assets and
API as one Worker version. Build-time `VITE_*` values are read from `.env`;
`ALLOWED_ORIGINS` is deployed as a Worker runtime binding. The previous
`deploy:backend` command remains as an alias.

CI reads the same non-sensitive configuration from GitHub Actions repository
variables. See [Backend API configuration](docs/BACKEND_API.md#configuration)
for the complete list. Cloudflare credentials remain GitHub Actions secrets.

## License

MIT — see [LICENSE](LICENSE).

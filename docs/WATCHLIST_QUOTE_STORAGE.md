# Watchlist Quote Storage and Fetching

## Summary

The browser persists the watchlist configuration, but the application does not
persist watchlist quotes.

Quotes can nevertheless appear very quickly after a page reload because some
watchlist symbols already exist in the dashboard data and because the backend
keeps a short-lived Yahoo chart cache.

## Persisted watchlist data

`src/features/watchlist/watchlistStorage.ts` saves the watchlist state in
`localStorage` under the key `agy_watchlists`.

The persisted state contains:

- Watchlists and their IDs and names
- The active watchlist ID
- Symbols
- Tags
- Watchlist and item comments

When Google synchronization is enabled, the watchlist configuration can also be
synchronized through Firestore. This does not turn the quote data into persisted
watchlist state.

## Quote lifetime

`useWatchlistQuotes` initializes its quote map with React `useState`:

```ts
const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
```

This map contains the fetched price, daily and weekly changes, 52-week change,
year-to-date change, sparkline data, and update timestamp. It exists only in
memory and is cleared by a full page reload.

The Zustand market store is also in-memory only. It does not use Zustand's
persistence middleware.

## Quote resolution after reload

After loading `data.json`, the watchlist resolves every symbol in this order:

1. If the symbol already exists in the dashboard market store, the watchlist
   immediately reuses that market data.
2. If the symbol is missing from the market store, `useWatchlistQuotes` requests
   one year of daily chart data through the configured Cloudflare Worker.
3. The returned chart data is converted into the watchlist metrics and stored in
   component state for the current page session.

When no backend URL is configured, or if the backend request fails, local
development falls back to a cache-busted `corsproxy.io` request.

The initial fetch for missing symbols is sequential. Manual bulk refreshes are
also sequential and enforce a minimum interval of 500 ms, limiting them to two
requests per second.

## Why reloads may look cached

Fast quote display does not demonstrate that quotes are in `localStorage`.
Likely causes are:

- The symbol is part of `data.json`, which is loaded on application startup.
- The Worker has a fresh chart response in its short-lived edge cache.
- The network request and local metric calculation complete quickly.

`data.json` itself is requested with a timestamp query parameter, so the
application intentionally gives each dashboard-data request a unique URL.

To inspect the behavior, open browser developer tools and check requests to the
backend `/api/v1/charts/:symbol` endpoint. Its `X-Cache` header identifies
whether the Worker returned a hit, miss, refresh, or stale fallback.

## Current conclusion

There is no browser-persistent quote cache. Only the watchlist configuration is
deliberately stored in browser storage. The backend cache is intentionally
short-lived and does not persist quotes in the watchlist.

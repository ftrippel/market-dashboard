# TradingView Symbol Strategy

Use native/professional TradingView symbols instead of retail proxies (OANDA CFDs, ETF stand-ins, etc.).

Example: prefer `COMEX:PL1!` over `OANDA:XPTUSD`, and `TVC:US10Y` over `NASDAQ:IEF`.

## Rationale

Charts should show the real instrument. Our `DisplaySym` names (`PL1!`, `GC1!`, `US10Y`) already imply that model. Proxy mappings in `symbolMaps.json` were a reliability workaround, not the intended end state.

## Migration Plan

1. **Replace every proxy in `symbolMaps.json`**
   - Commodities: `OANDA:XPTUSD` → `COMEX:PL1!`
   - Yields: `NASDAQ:IEF` → `TVC:US10Y`
   - Index proxies: `OANDA:JP225USD` → `TVC:NI225`
   - ETF stand-ins: `AMEX:EWY` → `TVC:KOSPI`

2. **Use the overrides file as the migration checklist**

   See `symbol-mappings-tradingview-overrides.csv` — for each row, set **TradingView Symbol** to **TradingView Symbol Potential**.

3. **Make `toTradingViewSymbol()` prefer the native symbol**

   No fallback to OANDA/ETF unless a professional symbol truly fails in the embed.

4. **Manually verify each symbol in the TradingView widget**

   "Professional" only works if TradingView serves it in our embed context. Click through all override entries before calling migration done.

## Expected Trade-offs

### Pros

- Semantically correct charts
- Matches futures/yield/index naming in the app
- Better fit for a serious market dashboard
- No more "why is Gold showing OANDA?" confusion

### Cons

- Some symbols may load slower, require exchange access, or behave worse in embeds
- Futures have roll behavior (`PL1!` is continuous, but still not identical to spot)
- Yields on `TVC:` track differently from Yahoo `^TNX` — chart vs table mismatch is possible
- Indices like KOSPI/Nifty may still need judgment (`TVC:KOSPI` vs local exchange symbol)

## Symbol Selection Rule

Use the native TradingView symbol for the asset class — not "COMEX for everything."

| Asset | Professional symbol | Avoid |
|---|---|---|
| Platinum | `COMEX:PL1!` | `OANDA:XPTUSD` |
| 10Y yield | `TVC:US10Y` | `NASDAQ:IEF` |
| Nikkei | `TVC:NI225` | `OANDA:JP225USD` |
| BTC | `COINBASE:BTCUSD` | (already correct) |

## Decision

Migrate all overrides to the Potential column and remove proxy mappings. Accept a short verification pass and handle any edge-case symbols that need a different native feed.

## Related Files

- `config/symbolMaps.json` — source of truth for mappings
- `docs/symbol-mappings.csv` — full symbol table
- `docs/symbol-mappings-tradingview-overrides.csv` — entries with explicit `tradingView` overrides (migration checklist)

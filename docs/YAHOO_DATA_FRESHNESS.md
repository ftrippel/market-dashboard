# Yahoo Finance calculation and data freshness

The watchlist gets price history and quote metadata from Yahoo Finance. Yahoo can return
today's unfinished daily candle while omitting the immediately preceding trading day's
candle for some symbols. Because of that behavior, the last two daily candles are not a
reliable source for the current `1D%`.

## Correct `1D%` calculation

For equities, ETFs, indices, futures, commodities, currencies, and crypto, the watchlist
uses Yahoo's quote snapshot:

```text
1D% = (regularMarketPrice - previousClose) / abs(previousClose) * 100
```

For yield symbols, the displayed one-day move is in basis points:

```text
1D (bps) = (regularMarketPrice - previousClose) * 100
```

Yahoo's `regularMarketPrice` is the current regular-session price while the market is open
and the final regular-session price after it closes. `previousClose` is the preceding
regular-session close. This makes the calculation consistent intraday and after the close.

Daily candles remain the source for `1W`, `52W Hi`, `YTD`, and sparkline history. If Yahoo
does not supply a usable market snapshot, `1D%` falls back to the final two available daily
candles.

### Why the old calculation failed

On 2026-07-24 during the European session, yfinance returned the following daily histories:

| Symbol | Last two daily dates | Daily-candle `1D%` | Yahoo quote `1D%` |
| --- | --- | ---: | ---: |
| `SAP.DE` | Jul 22 → Jul 24 | +3.48% | +6.45% |
| `SIE.DE` | Jul 22 → Jul 24 | -0.42% | +0.76% |
| `ASML.AS` | Jul 22 → Jul 24 | -0.04% | +0.58% |
| `AIR.PA` | Jul 22 → Jul 24 | -2.59% | -0.78% |
| `^GDAXI` | Jul 23 → Jul 24 | +0.55% | +0.56% |

The individual equities were missing Jul 23 in their daily series, so comparing the last
two rows measured a two-session move. Yahoo's `regularMarketChangePercent` independently
matched the calculation from `regularMarketPrice` and `previousClose`.

## Real-time versus delayed data

Correct calculation and quote freshness are separate concerns. The watchlist calculates
the change correctly for the Yahoo snapshot it receives, but it cannot make an
exchange-delayed quote real-time.

Delay is determined by the exchange or data provider, not only by broad instrument type.
Yahoo can also change coverage. The table below summarizes the symbol families most
relevant to this dashboard:

| Symbol or market family | Typical Yahoo delay |
| --- | --- |
| Nasdaq-listed US equities; S&P, Dow Jones, and Nasdaq indices | Real-time |
| German/Xetra `.DE`, Euronext Paris `.PA`, Euronext Amsterdam `.AS` | 15 minutes |
| FTSE indices | 15 minutes |
| London Stock Exchange `.L` | 20 minutes |
| Swiss Exchange `.SW` | 30 minutes |
| Hong Kong stocks `.HK` and Hang Seng indices | 15 minutes |
| Tokyo stocks `.T` | 20 minutes |
| Nikkei indices | 30 minutes |
| Shanghai `.SS` and Shenzhen `.SZ` | 30 minutes |
| CME and CBOT futures | 10 minutes |
| COMEX and NYMEX futures | 30 minutes |
| ICE Futures US | 30 minutes |
| Yahoo currency pairs ending in `=X` | Real-time |
| Cryptocurrencies such as `BTC-USD` and `ETH-USD` | Real-time |

Observed yfinance timestamps on 2026-07-24 agreed with the published categories: German,
French, Dutch, DAX, and FTSE quotes were about 15 minutes behind; CME futures were about
10 minutes behind; currency and crypto timestamps were current.

This table is intentionally not exhaustive. For a symbol not listed here, check the
exchange and quote timestamp on Yahoo Finance. Yahoo's full exchange-level reference is:

- [Exchanges and data providers on Yahoo Finance](https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html)
- [Check real-time data in Yahoo Finance for Web](https://help.yahoo.com/kb/finance-for-web/check-real-time-data-yahoo-finance-web-sln2321.html)

## Operational notes

- A refresh updates the value to the newest Yahoo snapshot; it does not bypass an exchange
  delay.
- `regularMarketPrice` intentionally excludes pre-market and post-market moves.
- After the regular close, `regularMarketPrice` and `previousClose` continue to represent
  the just-completed session and the session before it.
- Yahoo data is informational and should not be treated as an execution-quality market
  feed.

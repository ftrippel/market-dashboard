# Market Breadth & Sentiment Thresholds

The **Market Internals Dashboard** (Section 03) colors and labels each card based on hardcoded thresholds in `src/features/breadth/BreadthSection.tsx`.

Data is loaded from `public/data.json` → `breadth` and refreshed by `scripts/fetch_data.py`.

---

## Fear & Greed (CNN Index)

| Field | Rule |
|-------|------|
| **Display value** | Whole number (`score.toFixed(0)`) |
| **Color** | Green ≥ 60 · Red ≤ 40 · Amber otherwise |
| **Subtitle** | API rating string (e.g. `EXTREME FEAR`) — not derived locally |
| **Fallback** | Score 50, rating `Neutral` if missing |

**Source:** CNN Fear & Greed Index (scraped in `fetch_fear_greed()`).

---

## NAAIM Exposure

| Field | Rule |
|-------|------|
| **Display value** | One decimal (`value.toFixed(1)`) |
| **Color** | Red ≥ 80 · Green ≤ 30 · Amber otherwise · Gray if unavailable |
| **Subtitle** | See label bands below |

### Label bands

| Value | Label |
|-------|-------|
| ≥ 80 | `OVEREXPOSED` |
| ≥ 50 | `BULLISH` |
| ≥ 30 | `NEUTRAL` |
| < 30 | `DEFENSIVE` |
| missing | `N/A` |

**Source:** [NAAIM Exposure Index](https://naaim.org/programs/naaim-exposure-index/) (scraped weekly). Stored as one decimal in `data.json` (`round(val, 1)` in `fetch_naaim()`).

---

## Advancers

| Field | Rule |
|-------|------|
| **Display value** | Advancer count (locale-formatted if ≥ 1000) |
| **Net** | `advancers − decliners` |
| **Color** | Green if net ≥ 0 · Red if net < 0 |
| **Subtitle** | `▲ +X net` or `▼ X net` |
| **Note** | Shows decliner count for context |

No absolute thresholds (e.g. no fixed “bullish” advancer count). Only the sign of the net matters for color.

**Source:** S&P 500 component day-over-day closes (`compute_sp500_breadth()`).

---

## New Highs

| Field | Rule |
|-------|------|
| **Display value** | New 52-week high count |
| **Net** | `new_highs − new_lows` |
| **Color** | Green if net ≥ 0 · Red if net < 0 |
| **Subtitle** | `▲ +X net` or `▼ X net` |
| **Note** | Shows new low count for context |

Same net-based coloring as Advancers — no fixed level thresholds.

**Source:** S&P 500 components within 1% of 52-week high/low (`compute_sp500_breadth()`).

---

## % > SMA 20 / 50 / 200

All three SMA cards share the same thresholds.

| Field | Rule |
|-------|------|
| **Display value** | One decimal percent |
| **Color** | Green ≥ 60% · Red ≤ 40% · Amber otherwise |

### Label bands

| Value | Label |
|-------|-------|
| ≥ 60% | `BROAD STRENGTH` |
| ≤ 40% | `WEAK BREADTH` |
| otherwise | `MIXED` |

**Source:** Share of S&P 500 stocks above their 20-, 50-, or 200-day simple moving average (`compute_sp500_breadth()`).

---

## Color reference

| Semantic | Usage |
|----------|--------|
| **Green** | Bullish / strength / net positive |
| **Red** | Bearish / weakness / net negative / overexposed (NAAIM) |
| **Amber** | Neutral / mixed / mid-range |
| **Gray (`text3`)** | Data unavailable |

Colors come from `src/utils/formatting.ts` → `colors`.

---

## Changing thresholds

Edit `buildBreadthCards()` in `src/features/breadth/BreadthSection.tsx`. There are no env vars or config files for these values.

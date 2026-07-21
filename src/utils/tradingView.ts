import { toTradingViewSymbol } from '../data/symbolMaps';

export { toTradingViewSymbol };

export function buildTradingViewChartUrl(tvSym: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`;
}

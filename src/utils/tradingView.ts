import { toTradingViewSymbol } from '../data/symbolMaps';

export { toTradingViewSymbol };

export const TRADINGVIEW_ADVANCED_CHART_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

export function buildTradingViewChartUrl(tvSym: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`;
}

export interface AdvancedChartWidgetConfig {
  autosize: boolean;
  symbol: string;
  interval: string;
  range?: string;
  timezone: string;
  theme: 'light' | 'dark';
  backgroundColor: string;
  style: string;
  locale: string;
  allow_symbol_change: boolean;
  save_image: boolean;
  hide_side_toolbar: boolean;
  withdateranges: boolean;
  show_popup_button: boolean;
  popup_width: string;
  popup_height: string;
  calendar: boolean;
  support_host: string;
  studies: Array<
    | string
    | {
        id: string;
        inputs?: { length: number };
      }
  >;
}

export function buildAdvancedChartWidgetConfig(
  tvSym: string,
  theme: 'light' | 'dark' = 'dark'
): AdvancedChartWidgetConfig {
  return {
    autosize: true,
    symbol: tvSym,
    interval: 'D',
    timezone: 'exchange',
    theme,
    backgroundColor: theme === 'dark' ? 'rgba(19, 23, 34, 1)' : 'rgba(255, 255, 255, 1)',
    style: '1',
    locale: 'en',
    allow_symbol_change: true,
    save_image: false,
    hide_side_toolbar: false,
    withdateranges: true,
    show_popup_button: true,
    popup_width: '1000',
    popup_height: '650',
    calendar: false,
    support_host: 'https://www.tradingview.com',
    studies: [
      { id: 'MAExp@tv-basicstudies', inputs: { length: 20 } },
      { id: 'MASimple@tv-basicstudies', inputs: { length: 50 } },
      { id: 'MASimple@tv-basicstudies', inputs: { length: 200 } },
    ],
  };
}

export function buildMiniCandleChartWidgetConfig(
  tvSym: string,
  theme: 'light' | 'dark' = 'dark'
) {
  return {
    autosize: true,
    symbol: tvSym,
    interval: 'D',
    timezone: 'exchange',
    theme,
    backgroundColor: theme === 'dark' ? 'rgba(15, 20, 25, 1)' : 'rgba(255, 255, 255, 1)',
    style: '1', // 1 = Candlesticks
    locale: 'en',
    allow_symbol_change: false,
    save_image: false,
    hide_side_toolbar: true,
    hide_top_toolbar: true,
    hide_legend: true,
    withdateranges: false,
    show_popup_button: false,
    calendar: false,
    support_host: 'https://www.tradingview.com',
    studies: [],
  };
}


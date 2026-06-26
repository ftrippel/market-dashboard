const TV_SYMBOL_MAP: Record<string, string> = {
  'ES1!': 'OANDA:SPX500USD',
  'NQ1!': 'OANDA:NAS100USD',
  'RTY1!': 'OANDA:US2000USD',
  'YM1!': 'OANDA:US30USD',
  'DX-Y.NYB': 'CAPITALCOM:DXY',
  'CBOE:VIX': 'AMEX:VIXY',
  VIX: 'AMEX:VIXY',
  'GC1!': 'OANDA:XAUUSD',
  'SI1!': 'OANDA:XAGUSD',
  'HG1!': 'CAPITALCOM:COPPER',
  'PL1!': 'OANDA:XPTUSD',
  'PA1!': 'OANDA:XPDUSD',
  'ALI1!': 'AMEX:JJU',
  'CL1!': 'OANDA:WTICOUSD',
  'NG1!': 'OANDA:NATGASUSD',
  US2Y: 'NASDAQ:SHY',
  US10Y: 'NASDAQ:IEF',
  US30Y: 'NASDAQ:TLT',
  '^N225': 'OANDA:JP225USD',
  '^KS11': 'AMEX:EWY',
  '^NSEI': 'AMEX:INDA',
  '000001.SS': 'SSE:000001',
  '000300.SS': 'SZSE:399300',
  '^HSI': 'FXOPEN:HSI',
  '^FTSE': 'OANDA:UK100GBP',
  '^FCHI': 'OANDA:FR40EUR',
  '^GDAXI': 'OANDA:DE30EUR',
  DXY: 'CAPITALCOM:DXY',
  UKX: 'OANDA:UK100GBP',
  BTC: 'CRYPTOCAP:BTC',
  ETH: 'CRYPTOCAP:ETH',
  SOL: 'CRYPTOCAP:SOL',
  XRP: 'CRYPTOCAP:XRP',
};

export const TRADINGVIEW_ADVANCED_CHART_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

export function toTradingViewSymbol(rawSym: string): string {
  return TV_SYMBOL_MAP[rawSym] ?? rawSym;
}

export interface AdvancedChartWidgetConfig {
  autosize: boolean;
  symbol: string;
  interval: string;
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
    ],
  };
}

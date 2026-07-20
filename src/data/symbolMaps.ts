import rawMaps from '../../config/symbolMaps.json';
import { stripExchangeSuffix } from '../utils/symbols';

export interface SymbolMapEntry {
  name?: string;
  displaySym?: string;
  sym?: string;
  tradingView?: string;
  isYield?: boolean;
  source?: 'yahoo' | 'fred';
  massive?: string;
}

export interface SymbolMapsFile {
  version: number;
  symbols: Record<string, SymbolMapEntry>;
}

const symbolMaps = rawMaps as SymbolMapsFile;

interface SymbolLookup {
  yahoo: string;
  entry: SymbolMapEntry;
}

const byDashboardSym = new Map<string, SymbolLookup>();

for (const [yahoo, entry] of Object.entries(symbolMaps.symbols)) {
  const dashboardSym = entry.displaySym ?? yahoo;
  byDashboardSym.set(dashboardSym, { yahoo, entry });
  if (!byDashboardSym.has(yahoo)) {
    byDashboardSym.set(yahoo, { yahoo, entry });
  }
}

export interface SymbolMeta {
  name: string;
  sym: string;
  isYield?: boolean;
}

function lookup(dashboardSym: string): SymbolLookup | undefined {
  return byDashboardSym.get(dashboardSym);
}

export function toDashboardSym(yahooSym: string): string {
  const entry = symbolMaps.symbols[yahooSym];
  return entry?.displaySym ?? yahooSym;
}

export function toYahooFinanceSymbol(dashboardSym: string): string {
  return lookup(dashboardSym)?.yahoo ?? dashboardSym;
}

export function toTradingViewSymbol(dashboardSym: string): string {
  const hit = lookup(dashboardSym);
  if (hit?.entry.tradingView) return hit.entry.tradingView;

  const direct = symbolMaps.symbols[dashboardSym];
  if (direct?.tradingView) return direct.tradingView;

  return stripExchangeSuffix(dashboardSym);
}

export function getSymbolMeta(dashboardSym: string): SymbolMeta {
  const hit = lookup(dashboardSym);
  if (!hit) return { name: dashboardSym, sym: dashboardSym };

  const { yahoo, entry } = hit;
  const effectiveDashboardSym = entry.displaySym ?? yahoo;

  return {
    name: entry.name ?? dashboardSym,
    sym: entry.sym ?? effectiveDashboardSym,
    isYield: entry.isYield,
  };
}

/** Hand-coded label if present, else yfinance shortName from data.json, else symbol. */
export function getDisplayName(dashboardSym: string, fetchedName?: string): string {
  const hit = lookup(dashboardSym);
  if (hit?.entry.name) return hit.entry.name;

  const trimmed = fetchedName?.trim();
  return trimmed || dashboardSym;
}

export function getSymbolMaps(): SymbolMapsFile {
  return symbolMaps;
}

export function isYieldSymbol(sym: string): boolean {
  return Boolean(lookup(sym)?.entry.isYield);
}

export function isYahooFetchable(sym: string): boolean {
  const hit = lookup(sym);
  if (!hit) return true;
  return hit.entry.source !== 'fred';
}

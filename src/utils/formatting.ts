/**
 * Number and value formatting utilities
 */

const US_LOCALE = 'en-US';

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString(US_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatUsInteger(value: number): string {
  return value.toLocaleString(US_LOCALE, { maximumFractionDigits: 0 });
}

/** Parse user input that may include US thousand separators. */
export function parseUsNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function formatUsCurrency(value: number, decimals = 0): string {
  return `$${formatNumber(value, decimals)}`;
}

export function formatPercent(value: number, badge = false, maxPct = 15): string {
  const clamped = Math.min(Math.abs(value), maxPct);
  const display = `${clamped.toFixed(2)}%`;

  if (badge) {
    const pct = (clamped / maxPct) * 100;
    return `${display}|${Math.round(pct)}`;
  }

  return display;
}

export function formatBPS(value: number): string {
  return `${(value * 100).toFixed(1)} bps`;
}

export function formatPrice(value: number): string {
  if (value >= 1000) {
    return formatNumber(value, 0);
  }
  if (value >= 100) {
    return formatNumber(value, 2);
  }
  if (value >= 10) {
    return formatNumber(value, 2);
  }
  return formatNumber(value, 4);
}

export function getChangeColor(value: number): 'text-green' | 'text-red' | 'text-neutral' {
  if (value > 0) return 'text-green';
  if (value < 0) return 'text-red';
  return 'text-neutral';
}

/** CSS custom properties — resolved per theme via App.css */
export const colors = {
  bg: 'var(--bg)',
  bg2: 'var(--bg2)',
  bg3: 'var(--bg3)',
  bg4: 'var(--bg4)',
  border: 'var(--border)',
  border2: 'var(--border2)',
  accent: 'var(--accent)',
  accent2: 'var(--accent2)',
  green: 'var(--green)',
  red: 'var(--red)',
  amber: 'var(--amber)',
  text: 'var(--text)',
  text2: 'var(--text2)',
  text3: 'var(--text3)',
  accentHoverBg: 'var(--accent-hover-bg)',
  accentSubtleBg: 'var(--accent-subtle-bg)',
  accentBorder: 'var(--accent-border)',
  accentBorderSoft: 'var(--accent-border-soft)',
  amberSubtleBg: 'var(--amber-subtle-bg)',
  amberBorder: 'var(--amber-border)',
  greenDimBg: 'var(--green-dim-bg)',
  redDimBg: 'var(--red-dim-bg)',
  neutralDimBg: 'var(--neutral-dim-bg)',
  rowBorder: 'var(--row-border)',
  rowHoverBg: 'var(--row-hover-bg)',
  benchRowBg: 'var(--bench-row-bg)',
  linkUnderline: 'var(--link-underline)',
} as const;

export type ColorKey = keyof typeof colors;

/** Read a resolved theme color (for canvas, etc.). */
export function getThemeColor(key: ColorKey): string {
  if (typeof document === 'undefined') return '';
  const varName = colors[key].slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

const BERLIN_TZ = 'Europe/Berlin';

export interface DataTimestampInfo {
  badge: string;
  statusLine: string;
  ageLabel: string;
}

/** Format `generated_at` from data.json for display in the dashboard. */
export function formatDataTimestamp(iso: string | null): DataTimestampInfo | null {
  if (!iso) return null;

  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;

  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    hour12: false,
  }).format(dt);

  const ageMs = Math.max(0, Date.now() - dt.getTime());
  const ageHrs = Math.floor(ageMs / 3_600_000);
  const ageMins = Math.floor((ageMs % 3_600_000) / 60_000);

  let ageLabel: string;
  if (ageHrs > 0) {
    ageLabel = `${ageHrs}h ${ageMins}m ago`;
  } else if (ageMins > 0) {
    ageLabel = `${ageMins}m ago`;
  } else {
    ageLabel = 'just now';
  }

  return {
    badge: `DATA · ${formatted} (${ageLabel})`,
    statusLine: `Generated ${formatted} · ${ageLabel}`,
    ageLabel,
  };
}

export function formatHoverTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return 'No timestamp available';
  const dt = new Date(timestamp);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN_TZ,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    hour12: false,
  }).format(dt);
}

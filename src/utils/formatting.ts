/**
 * Number and value formatting utilities
 */

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
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

export const colors = {
  bg: '#ffffff',
  bg2: '#f7f8fa',
  bg3: '#eff2f6',
  bg4: '#e8ecf2',
  border: '#d0d7e0',
  border2: '#c0c7d0',
  accent: '#1f5aff',
  accent2: '#0047cc',
  green: '#0caf42',
  red: '#f23645',
  amber: '#ff8f00',
  text: '#2a2e37',
  text2: '#686d78',
  text3: '#9ba0a9',
};

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

  const ageMs = Date.now() - dt.getTime();
  const ageHrs = Math.floor(ageMs / 3_600_000);
  const ageMins = Math.floor(ageMs / 60_000);
  const ageLabel =
    ageMins < 1 ? 'just now' : ageHrs < 1 ? `${ageMins}m ago` : ageHrs === 1 ? '1h ago' : `${ageHrs}h ago`;

  return {
    badge: `DATA · ${formatted}`,
    statusLine: `Generated ${formatted} · ${ageLabel}`,
    ageLabel,
  };
}

export type MaType = 'sma' | 'ema';

export interface MovingAverageConfig {
  id: string;
  type: MaType;
  period: number;
  color: string;
  enabled: boolean;
}

export type ChartMaSettings = MovingAverageConfig[];

export const MAX_CHART_MAS = 8;

export const DEFAULT_CHART_MA_SETTINGS: ChartMaSettings = [
  { id: 'default-ema-20', type: 'ema', period: 20, color: '#f5a623', enabled: true },
  { id: 'default-sma-50', type: 'sma', period: 50, color: '#5b8cff', enabled: true },
  { id: 'default-sma-200', type: 'sma', period: 200, color: '#c084fc', enabled: true },
];

export function createMaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ma-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultMa(overrides?: Partial<Omit<MovingAverageConfig, 'id'>>): MovingAverageConfig {
  return {
    id: createMaId(),
    type: 'sma',
    period: 20,
    color: '#5b8cff',
    enabled: true,
    ...overrides,
  };
}

export function clampMaPeriod(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(500, Math.max(2, Math.round(value)));
}

export function formatMaLabel(type: MaType, period: number): string {
  return `${type.toUpperCase()} ${period}`;
}

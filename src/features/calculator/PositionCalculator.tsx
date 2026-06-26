import { useMemo, useState } from 'react';
import { FormattedNumberInput, Icon, Section } from '../../components/common';
import { colors, formatUsCurrency, formatUsInteger } from '../../utils/formatting';

type Direction = 'long' | 'short';

interface StopLevel {
  lbl: string;
  price: number;
  shares: number;
  pct: number;
  pnl: number;
  cls: 'sr-entry' | 'sr-mid' | 'sr-fin';
}

function levelColor(cls: StopLevel['cls']): string {
  if (cls === 'sr-entry') return colors.accent;
  if (cls === 'sr-fin') return colors.red;
  return colors.amber;
}

export function PositionCalculator() {
  const [direction, setDirection] = useState<Direction>('long');
  const [stops, setStops] = useState<2 | 3>(2);
  const [equity, setEquity] = useState(10_000_000);
  const [riskPct, setRiskPct] = useState(0.3);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(95);

  const calc = useMemo(() => {
    if (!equity || !riskPct || !entry || !stop) return null;
    const rAmt = equity * (riskPct / 100);
    const rPts = Math.abs(entry - stop);
    if (!rPts) return null;

    const shares = Math.floor(rAmt / rPts);
    const posVal = shares * entry;
    const pctEq = (posVal / equity) * 100;

    const levels: StopLevel[] = [];
    if (stops === 2) {
      const mid = (entry + stop) / 2;
      const s1 = Math.floor(shares / 2);
      const s2 = shares - Math.floor(shares / 2);
      levels.push({ lbl: 'Entry', price: entry, shares: 0, pct: 100, pnl: 0, cls: 'sr-entry' });
      levels.push({
        lbl: 'Stop 1 (mid)',
        price: mid,
        shares: s1,
        pct: Math.round((s2 / shares) * 100),
        pnl: -Math.abs(entry - mid) * s1,
        cls: 'sr-mid',
      });
      levels.push({
        lbl: 'Final Stop',
        price: stop,
        shares: s2,
        pct: 0,
        pnl: -rPts * s2,
        cls: 'sr-fin',
      });
    } else {
      const gap = rPts / 3;
      const dDir = direction === 'long' ? -1 : 1;
      const s1 = Math.floor(shares / 3);
      const s2 = Math.floor(shares / 3);
      const s3 = shares - Math.floor(shares / 3) - Math.floor(shares / 3);
      const p1 = entry + gap * dDir;
      const p2 = entry + gap * 2 * dDir;
      levels.push({ lbl: 'Entry', price: entry, shares: 0, pct: 100, pnl: 0, cls: 'sr-entry' });
      levels.push({
        lbl: 'Stop 1 (⅓)',
        price: p1,
        shares: s1,
        pct: Math.round(((shares - s1) / shares) * 100),
        pnl: -(gap * s1),
        cls: 'sr-mid',
      });
      levels.push({
        lbl: 'Stop 2 (⅔)',
        price: p2,
        shares: s2,
        pct: Math.round((s3 / shares) * 100),
        pnl: -(gap * 2 * s2),
        cls: 'sr-mid',
      });
      levels.push({
        lbl: 'Final Stop',
        price: stop,
        shares: s3,
        pct: 0,
        pnl: -(rPts * s3),
        cls: 'sr-fin',
      });
    }

    const rrTargets = [1, 1.5, 2, 3, 4, 5].map((r) => {
      const tgt = direction === 'long' ? entry + rPts * r : entry - rPts * r;
      const pnl = rPts * r * shares;
      return { r, tgt, pnl };
    });

    return { shares, rAmt, posVal, rPts, pctEq, levels, rrTargets };
  }, [direction, stops, equity, riskPct, entry, stop]);

  // RISK-BASED · STAGGERED STOPS

  return (
    <Section number="04" title="Position Sizing Calculator" subtitle="">
      <div className="calc-wrap">
        <div className="cpanel">
          <div className="c-ttl">
            <Icon name="chevron_right" size="sm" className="icon--label" />
            Trade Parameters
          </div>
          <div className="dir-tog">
            <button
              type="button"
              className={`dir-b long${direction === 'long' ? ' on' : ''}`}
              onClick={() => setDirection('long')}
            >
              <Icon name="arrow_upward" size="xs" /> LONG
            </button>
            <button
              type="button"
              className={`dir-b short${direction === 'short' ? ' on' : ''}`}
              onClick={() => setDirection('short')}
            >
              <Icon name="arrow_downward" size="xs" /> SHORT
            </button>
          </div>

          <div className="fg">
            <label className="fl">Account Equity (USD)</label>
            <FormattedNumberInput value={equity} onChange={setEquity} />
          </div>
          <div className="fg">
            <label className="fl">Risk per Trade (%)</label>
            <FormattedNumberInput value={riskPct} onChange={setRiskPct} decimals={2} />
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Entry Price ($)</label>
              <FormattedNumberInput value={entry} onChange={setEntry} decimals={2} />
            </div>
            <div className="fg">
              <label className="fl">Stop Loss ($)</label>
              <FormattedNumberInput value={stop} onChange={setStop} decimals={2} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Ticker (optional)</label>
            <input className="fi" type="text" placeholder="e.g. AAPL" style={{ textTransform: 'uppercase' }} />
          </div>

          {calc && (
            <div className="res">
              <div className="res-big">{formatUsInteger(calc.shares)}</div>
              <div className="res-lbl">SHARES TO TRADE</div>
              <div className="res-sub">
                <div className="ri">
                  <div className="rv" style={{ color: colors.red }}>
                    {formatUsCurrency(Math.round(calc.rAmt))}
                  </div>
                  <div className="rl">Max Risk $</div>
                </div>
                <div className="ri">
                  <div className="rv">{formatUsCurrency(Math.round(calc.posVal))}</div>
                  <div className="rl">Position Value</div>
                </div>
                <div className="ri">
                  <div className="rv" style={{ color: colors.amber }}>
                    {formatUsCurrency(calc.rPts, 2)}
                  </div>
                  <div className="rl">Risk/Share</div>
                </div>
                <div className="ri">
                  <div className="rv" style={{ color: colors.text2 }}>
                    {calc.pctEq.toFixed(1)}%
                  </div>
                  <div className="rl">% Equity</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="stops-panel">
          <div className="stops-hdr">
            <span style={{ fontSize: '9px', color: colors.text2, letterSpacing: '1px', textTransform: 'uppercase', marginRight: 'auto', display: 'inline-flex', alignItems: 'center' }}>
              <Icon name="chevron_right" size="xs" className="icon--label" />
              Staggered Stop Levels
            </span>
            <button type="button" className={`s-tab${stops === 2 ? ' on' : ''}`} onClick={() => setStops(2)}>
              2-STOP
            </button>
            <button type="button" className={`s-tab${stops === 3 ? ' on' : ''}`} onClick={() => setStops(3)}>
              3-STOP
            </button>
          </div>
          <div className="stops-body">
            <div className="sr-hdr">
              <span>Level</span>
              <span>Price</span>
              <span>Shares to Remove</span>
              <span>% of Position</span>
              <span>P&L at Stop</span>
            </div>
            {calc?.levels.map((lv) => (
              <div key={lv.lbl} className="sr">
                <span className="sr-lbl">{lv.lbl}</span>
                <span className="sr-price" style={{ color: levelColor(lv.cls), fontWeight: 600, fontSize: '14px' }}>
                  {formatUsCurrency(lv.price, 2)}
                </span>
                <span className="sr-shares" style={{ color: colors.text2, fontSize: '11px' }}>
                  {lv.shares === 0 ? '—' : `${formatUsInteger(lv.shares)} sh`}
                </span>
                <span className="sr-pct" style={{ color: colors.text2, fontSize: '11px' }}>
                  {lv.pct}%
                </span>
                <span
                  className="sr-pnl"
                  style={{
                    color: lv.pnl < 0 ? colors.red : lv.pnl > 0 ? colors.green : colors.accent,
                    fontSize: '11px',
                  }}
                >
                  {lv.pnl === 0 ? '—' : formatUsCurrency(Math.round(lv.pnl))}
                </span>
              </div>
            ))}

            {calc && (
              <>
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
                  <div className="viz-note">Scale-Out Visualization</div>
                  <div className="scale-viz">
                    <div
                      style={{
                        position: 'absolute',
                        top: '20px',
                        left: 0,
                        right: 0,
                        height: '1px',
                        background: colors.border2,
                      }}
                    />
                    {(() => {
                      const prices = calc.levels.map((l) => l.price);
                      const mn = Math.min(...prices) * 0.9985;
                      const mx = Math.max(...prices) * 1.0015;
                      const rng = mx - mn;
                      return calc.levels.map((lv) => {
                        const x = ((lv.price - mn) / rng) * 100;
                        const col = levelColor(lv.cls);
                        return (
                          <div key={`viz-${lv.lbl}`}>
                            <div
                              style={{
                                position: 'absolute',
                                left: `${x}%`,
                                top: '8px',
                                width: '2px',
                                height: '24px',
                                background: col,
                                borderRadius: '1px',
                                transform: 'translateX(-1px)',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                left: `${x}%`,
                                bottom: '-4px',
                                transform: 'translateX(-50%)',
                                fontSize: '8.5px',
                                color: colors.text3,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatUsCurrency(lv.price, 2)}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div style={{ marginTop: '22px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
                  <div className="viz-note" style={{ marginBottom: '8px' }}>
                    R:R Targets
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {calc.rrTargets.map(({ r, tgt, pnl }) => (
                      <div
                        key={r}
                        style={{
                          background: colors.bg3,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '2px',
                          padding: '7px 9px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: '9px', color: colors.text3, letterSpacing: '1px', marginBottom: '3px' }}>
                          {r}:1 R
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: colors.green }}>
                          {formatUsCurrency(tgt, 2)}
                        </div>
                        <div style={{ fontSize: '9px', color: colors.green, marginTop: '2px' }}>
                          +{formatUsCurrency(Math.round(pnl))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

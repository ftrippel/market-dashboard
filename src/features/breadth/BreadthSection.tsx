import { Card, CardLabel, Section } from '../../components/common';
import { colors } from '../../utils/formatting';
import type { Breadth } from '../../types';

interface BreadthCard {
  lbl: string;
  val: string;
  sub: string;
  col: string;
  note: string;
}

function buildBreadthCards(br: Breadth): BreadthCard[] {
  const fg = br.fear_greed ?? { score: 50, rating: 'Neutral' };
  const fgScore = typeof fg.score === 'number' ? fg.score : 50;
  const fgRating = (fg.rating || 'Neutral').replace(/_/g, ' ');
  const fgCol = fgScore >= 60 ? colors.green : fgScore <= 40 ? colors.red : colors.amber;

  const nm = br.naaim;
  const nmVal = nm && typeof nm.value === 'number' ? nm.value : null;
  const nmCol =
    nmVal === null ? colors.text3 : nmVal >= 80 ? colors.red : nmVal <= 30 ? colors.green : colors.amber;
  const nmLbl =
    nmVal === null
      ? 'N/A'
      : nmVal >= 80
        ? 'OVEREXPOSED'
        : nmVal >= 50
          ? 'BULLISH'
          : nmVal >= 30
            ? 'NEUTRAL'
            : 'DEFENSIVE';

  const ad = br.advance_decline ?? { advancers: 0, decliners: 0 };
  const adv = ad.advancers ?? 0;
  const dec = ad.decliners ?? 0;
  const adNet = adv - dec;
  const adCol = adNet >= 0 ? colors.green : colors.red;

  const hl = br.new_high_low ?? { new_highs: 0, new_lows: 0 };
  const nH = hl.new_highs ?? 0;
  const nL = hl.new_lows ?? 0;
  const hlNet = nH - nL;
  const hlCol = hlNet >= 0 ? colors.green : colors.red;

  const p20 = br.pct_above_sma20 ?? 0;
  const p50 = br.pct_above_sma50 ?? 0;
  const p200 = br.pct_above_sma200 ?? 0;
  const pCol = (p: number) => (p >= 60 ? colors.green : p <= 40 ? colors.red : colors.amber);
  const pLbl = (p: number) => (p >= 60 ? 'BROAD STRENGTH' : p <= 40 ? 'WEAK BREADTH' : 'MIXED');

  const fmt = (n: number) => (n >= 1000 ? n.toLocaleString() : String(n));
  const netStr = (n: number) => `${n >= 0 ? '▲ +' : '▼ '}${fmt(Math.abs(n))} net`;

  return [
    {
      lbl: 'Fear & Greed',
      val: fgScore.toFixed(0),
      sub: fgRating.toUpperCase(),
      col: fgCol,
      note: 'CNN Index · 0=Extreme Fear, 100=Extreme Greed',
    },
    {
      lbl: 'NAAIM Exposure',
      val: nmVal === null ? '—' : `${nmVal.toFixed(0)}%`,
      sub: nmLbl,
      col: nmCol,
      note: nm?.date ? `Active mgr equity exposure · ${nm.date}` : 'Active mgr equity exposure · weekly',
    },
    {
      lbl: 'Advancers',
      val: fmt(adv),
      sub: netStr(adNet),
      col: adCol,
      note: `vs ${fmt(dec)} decliners · session`,
    },
    {
      lbl: 'New Highs',
      val: fmt(nH),
      sub: netStr(hlNet),
      col: hlCol,
      note: `vs ${fmt(nL)} new lows · 52-wk`,
    },
    {
      lbl: '% > SMA 20',
      val: `${p20.toFixed(1)}%`,
      sub: pLbl(p20),
      col: pCol(p20),
      note: 'S&P 500 stocks above 20-day MA',
    },
    {
      lbl: '% > SMA 50',
      val: `${p50.toFixed(1)}%`,
      sub: pLbl(p50),
      col: pCol(p50),
      note: 'S&P 500 stocks above 50-day MA',
    },
    {
      lbl: '% > SMA 200',
      val: `${p200.toFixed(1)}%`,
      sub: pLbl(p200),
      col: pCol(p200),
      note: 'S&P 500 stocks above 200-day MA',
    },
  ];
}

interface BreadthSectionProps {
  breadth: Breadth | null;
}

export function BreadthSection({ breadth }: BreadthSectionProps) {
  const cards = breadth ? buildBreadthCards(breadth) : null;

  // S&P 500 INTERNALS · SENTIMENT INDICATORS · UPDATED DAILY
  return (
    <Section
      number="03"
      title="Market Breadth & Sentiment"
      subtitle=""
    >
      <Card label={<CardLabel>Market Internals Dashboard</CardLabel>} style={{ padding: '16px 18px' }}>
        <div
          id="breadthGrid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '10px',
          }}
        >
          {!cards ? (
            <div
              style={{
                color: colors.text3,
                fontSize: '11px',
                gridColumn: 'span 7',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              Breadth data unavailable — run fetch_data.py to generate
            </div>
          ) : (
            cards.map((c) => (
              <div
                key={c.lbl}
                style={{
                  background: colors.bg3,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  padding: '12px 8px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minHeight: '100px',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    fontSize: '8.5px',
                    color: colors.text3,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                  }}
                >
                  {c.lbl}
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: c.col,
                    fontFamily: 'IBM Plex Mono, monospace',
                    lineHeight: 1.1,
                  }}
                >
                  {c.val}
                </div>
                <div
                  style={{
                    fontSize: '8.5px',
                    color: c.col,
                    letterSpacing: '0.5px',
                    fontWeight: 500,
                  }}
                >
                  {c.sub}
                </div>
                <div style={{ fontSize: '7.5px', color: colors.text3, lineHeight: 1.3 }}>{c.note}</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </Section>
  );
}

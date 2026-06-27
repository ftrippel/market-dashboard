import { Card, CardLabel, ExpandableTableCard, MarketTable, Section } from '../../components/common';
import { useMarketStore } from '../../store/marketStore';
import type { MarketTableOptions } from '../../types';

const rankByW1: Pick<MarketTableOptions, 'sortBy' | 'sortOrder'> = {
  sortBy: 'w1',
  sortOrder: 'desc',
};

export function EquitiesSection() {
  const store = useMarketStore();

  return (
    <Section number="02" title="Equities Overview">
      <Card label={<CardLabel>Major ETF Stats</CardLabel>} style={{ marginBottom: '9px' }}>
        <MarketTable
          data={store.etfs}
          nameLabel="ETF"
          showTrend
          showHoldings
          holdings={store.holdings}
          {...rankByW1}
        />
      </Card>

      <Card label={<CardLabel>S&P 500 Sub-Index Performance</CardLabel>} style={{ marginBottom: '9px' }}>
        <MarketTable
          data={store.submkt}
          nameLabel="ETF"
          showTrend
          showHoldings
          holdings={store.holdings}
          {...rankByW1}
        />
      </Card>

      <div className="g2" style={{ marginBottom: '9px' }}>
        <Card label={<CardLabel>S&P 500 Sub-Sector</CardLabel>}>
          <MarketTable
            data={store.sectors}
            nameLabel="ETF"
            hasPrice={false}
            showTrend
            showHoldings
            benchmarkSym="SPY"
            holdings={store.holdings}
            {...rankByW1}
          />
        </Card>
        <Card label={<CardLabel>S&P 500 EW Sub-Sector</CardLabel>}>
          <MarketTable
            data={store.sectorsEW}
            nameLabel="ETF"
            hasPrice={false}
            showTrend
            showHoldings
            benchmarkSym="RSP"
            holdings={store.holdings}
            {...rankByW1}
          />
        </Card>
      </div>

      <ExpandableTableCard
        label={<CardLabel>Thematic Sectors — Top 10 Ranked by 1W</CardLabel>}
        expandTitle={`All Thematic Sectors (${store.thematic.length})`}
        data={store.thematic}
        holdings={store.holdings}
        style={{ marginBottom: '9px' }}
        tableProps={{
          nameLabel: 'Theme / ETF',
          hasPrice: false,
          showTrend: true,
          showHoldings: true,
          ...rankByW1,
        }}
      />

      <ExpandableTableCard
        label={<CardLabel>Country ETFs — Top 10 Ranked by 1W</CardLabel>}
        expandTitle={`All Country ETFs (${store.country.length})`}
        data={store.country}
        holdings={store.holdings}
        tableProps={{
          nameLabel: 'Country / ETF',
          hasPrice: false,
          showTrend: true,
          showHoldings: true,
          ...rankByW1,
        }}
      />
    </Section>
  );
};

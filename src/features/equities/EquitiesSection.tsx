import { Card, CardLabel, ExpandableTableCard, MarketTable, Section } from '../../components/common';
import { useMarketStore } from '../../store/marketStore';

export function EquitiesSection() {
  const store = useMarketStore();

  return (
    <Section number="02" title="Equities Overview">
      <Card label={<CardLabel>Indices</CardLabel>} symbols={store.etfs.map((x) => x.sym)} style={{ marginBottom: '9px' }}>
        <MarketTable
          data={store.etfs}
          nameLabel="ETF"
          showTrend
          showHoldings
          holdings={store.holdings}
        />
      </Card>

      <Card label={<CardLabel>S&P 500 Sub-Indices</CardLabel>} symbols={store.submkt.map((x) => x.sym)} style={{ marginBottom: '9px' }}>
        <MarketTable
          data={store.submkt}
          nameLabel="ETF"
          showTrend
          showHoldings
          holdings={store.holdings}
        />
      </Card>

      <div className="g2" style={{ marginBottom: '9px' }}>
        <Card label={<CardLabel>S&P 500 Sector ETFs</CardLabel>} symbols={store.sectors.map((x) => x.sym)}>
          <MarketTable
            data={store.sectors}
            nameLabel="ETF"
            hasPrice={false}
            showTrend
            showHoldings
            benchmarkSym="SPY"
            holdings={store.holdings}
          />
        </Card>
        <Card label={<CardLabel>S&P 500 Sector ETFs (EW)</CardLabel>} symbols={store.sectorsEW.map((x) => x.sym)}>
          <MarketTable
            data={store.sectorsEW}
            nameLabel="ETF"
            hasPrice={false}
            showTrend
            showHoldings
            benchmarkSym="RSP"
            holdings={store.holdings}
          />
        </Card>
      </div>

      <ExpandableTableCard
        label={<CardLabel>Thematic ETFs</CardLabel>}
        expandTitle={`Thematic ETFs (${store.thematic.length})`}
        data={store.thematic}
        holdings={store.holdings}
        style={{ marginBottom: '9px' }}
        tableProps={{
          nameLabel: 'ETF',
          hasPrice: false,
          showTrend: true,
          showHoldings: true,
        }}
      />

      <ExpandableTableCard
        label={<CardLabel>Country ETFs</CardLabel>}
        expandTitle={`Country ETFs (${store.country.length})`}
        data={store.country}
        holdings={store.holdings}
        tableProps={{
          nameLabel: 'ETF',
          hasPrice: false,
          showTrend: true,
          showHoldings: true,
        }}
      />
    </Section>
  );
};

import { Card, CardLabel, MarketTable, Section } from '../../components/common';
import { useMarketStore } from '../../store/marketStore';
import { colors } from '../../utils/formatting';

export function MacroSection() {
  const store = useMarketStore();

  //  EOD SNAPSHOT · PREV CLOSE · RANKED BY CATEGORY
  return (
    <Section number="01" title="Macro Overview" subtitle="">
      <div className="mg">
        <Card label={<CardLabel>US Index Futures</CardLabel>}>
          <MarketTable data={store.futures} nameLabel="Contract" />
        </Card>
        <Card label={<CardLabel>Volatility & Dollar</CardLabel>}>
          <MarketTable data={store.dxvix} nameLabel="Instrument" />
        </Card>
      </div>

      <Card label={<CardLabel>Crypto</CardLabel>} style={{ marginBottom: '9px' }}>
        <MarketTable data={store.crypto} nameLabel="Asset" priceLabel="Price" />
      </Card>

      <div className="mg">
        <Card label={<CardLabel>Precious & Base Metals</CardLabel>}>
          <MarketTable data={store.metals} nameLabel="Metal" />
        </Card>
        <Card label={<CardLabel>Energy Commodities</CardLabel>}>
          <MarketTable data={store.commodities} nameLabel="Commodity" />
        </Card>
      </div>

      <div className="mg">
        <Card label={<CardLabel>US Treasury Yields</CardLabel>}>
          <MarketTable data={store.yields} nameLabel="Tenor" isYield priceLabel="Yield%" />
        </Card>
        <Card label={<CardLabel>Global Market Indices</CardLabel>}>
          <MarketTable data={store.global} nameLabel="Index" />
        </Card>
      </div>
    </Section>
  );
}

export function MacroDivider() {
  return (
    <div
      style={{
        height: '1px',
        background: `linear-gradient(90deg, ${colors.accent}, transparent)`,
        opacity: 0.2,
        margin: '18px 0',
      }}
    />
  );
}

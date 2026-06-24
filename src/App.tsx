import { useCallback, useRef, useState } from 'react';
import { Header, Toast, TradingViewModal } from './components/common';
import { ChartModalProvider } from './context/ChartModalContext';
import { MacroDivider, MacroSection } from './features/macro/MacroSection';
import { EquitiesSection } from './features/equities/EquitiesSection';
import { BreadthSection } from './features/breadth/BreadthSection';
import { PositionCalculator } from './features/calculator/PositionCalculator';
import { useMarketStore } from './store/marketStore';
import { useMarketData } from './hooks/useMarketData';
import {
  buildClipboardSnapshot,
  buildShareTweetText,
  copySnapshotText,
  downloadDashboardSnapshot,
  shareDashboardToX,
} from './services/share';
import { colors, formatDataTimestamp } from './utils/formatting';
import './App.css';

function DashboardContent() {
  const store = useMarketStore();
  const { error: dataError } = useMarketData();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastDuration, setToastDuration] = useState(3200);
  const [snapFlash, setSnapFlash] = useState(false);
  const dataTimestamp = formatDataTimestamp(store.generatedAt);

  const showToast = useCallback((message: string, durationMs = 3200) => {
    setToastDuration(durationMs);
    setToastMessage(message);
  }, []);

  const flashSnap = useCallback(() => {
    setSnapFlash(true);
    window.setTimeout(() => setSnapFlash(false), 150);
  }, []);

  const handleSnap = useCallback(async () => {
    const target = wrapRef.current;
    if (!target) return;
    try {
      showToast('Generating snapshot...');
      await downloadDashboardSnapshot(target, flashSnap);
      showToast('PNG saved — attach to X or paste into OneNote');
    } catch (err) {
      showToast(`❌ Screenshot failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 5000);
    }
  }, [flashSnap, showToast]);

  const handleShareX = useCallback(async () => {
    const target = wrapRef.current;
    if (!target) return;
    try {
      showToast('📸 Capturing screenshot…', 8000);
      const tweetText = buildShareTweetText(store);
      const result = await shareDashboardToX(target, tweetText);
      if (result === 'clipboard') {
        showToast('✅ Screenshot copied — paste with Ctrl+V in X / OneNote');
      } else {
        showToast('💾 Image downloaded — attach it to your X post');
      }
    } catch (err) {
      showToast(`❌ Screenshot failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 5000);
    }
  }, [showToast, store]);

  const handleCopy = useCallback(async () => {
    try {
      const text = buildClipboardSnapshot(store);
      await copySnapshotText(text);
      showToast('Formatted snapshot copied → paste into OneNote');
    } catch (err) {
      showToast(`Copy failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 5000);
    }
  }, [showToast, store]);

  const dataReady = !store.loading && store.futures.length > 0;
  const dataLabel = store.loading
    ? 'Loading market data...'
    : dataReady
      ? '✓ Market data loaded — EOD prices'
      : '⚠ No market data available';

  return (
    <div className="app">
      <div className={`snap-flash${snapFlash ? ' on' : ''}`} />
      <Toast
        message={toastMessage || dataError}
        durationMs={toastDuration}
        onClose={() => setToastMessage(null)}
      />
      <TradingViewModal />

      <div className="wrap" ref={wrapRef}>
        <Header
          loading={store.loading}
          badgeLabel={dataTimestamp?.badge ?? 'LOADING DATA...'}
          badgeOk={dataReady}
          onSnap={handleSnap}
          onShareX={handleShareX}
          onCopy={handleCopy}
        />

        <div className="quote-bar">
          <div className="quote-icon">✦</div>
          <div className="quote-text">"If you Fail to Plan, You are Planning to Fail"</div>
          <div className="quote-author">— Benjamin Franklin</div>
          <div className="quote-icon">✦</div>
        </div>

        <div className="api-bar">
          ⬤ &nbsp;
          <span style={{ color: dataReady ? colors.green : colors.text2 }}>{dataLabel}</span>
          <span style={{ color: colors.text3, fontSize: '9px', marginLeft: 'auto' }}>
            {dataTimestamp
              ? `${dataTimestamp.statusLine} · Yahoo Finance`
              : 'Awaiting data.json · Yahoo Finance'}
          </span>
        </div>

        <MacroSection />
        <MacroDivider />
        <EquitiesSection />
        <MacroDivider />
        <BreadthSection breadth={store.breadth} />
        <MacroDivider />
        <PositionCalculator />

        {store.loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: colors.text3 }}>
            Loading market data...
          </div>
        )}

        {!store.loading && store.futures.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px', color: colors.red }}>
            ⚠️ No data loaded. Check browser console for errors.
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <ChartModalProvider>
      <DashboardContent />
    </ChartModalProvider>
  );
}

export default App;

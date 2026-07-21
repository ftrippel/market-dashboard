import { memo, useCallback, useRef, useState, useEffect } from 'react';
import { fetchYahooFinancePrice } from './services/api';
import { Header, Toast, TradingViewModal, SymbolPreviewOverlay, SettingsModal } from './components/common';
import { ChartModalProvider } from './context/ChartModalContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { SettingsSyncProvider } from './context/SettingsSyncContext';
import { SymbolPreviewProvider } from './context/SymbolPreviewContext';
import { MacroDivider, MacroSection } from './features/macro/MacroSection';
import { EquitiesSection } from './features/equities/EquitiesSection';
import { BreadthSection } from './features/breadth/BreadthSection';
import { PositionCalculator } from './features/calculator/PositionCalculator';
import { WatchlistSection } from './features/watchlist/WatchlistSection';
import { useMarketStore } from './store/marketStore';
import { useMarketData } from './hooks/useMarketData';
import {
  buildClipboardSnapshot,
  buildShareTweetText,
  copySnapshotText,
  downloadDashboardSnapshot,
  shareDashboardToX,
} from './services/share';
import { config } from './config';
import { colors } from './utils/formatting';
import { Icon } from './components/common/Icon';
import './App.css';

function getVisibleSymbols(): string[] {
  const elements = document.querySelectorAll('[data-symbol]');
  const visible: string[] = [];
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const isVisible =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewportHeight &&
      rect.left < viewportWidth;

    if (isVisible) {
      const sym = el.getAttribute('data-symbol');
      if (sym && !visible.includes(sym)) {
        visible.push(sym);
      }
    }
  });

  return visible;
}

function DashboardContent() {
  const store = useMarketStore();
  const updatePrice = useMarketStore((state) => state.updatePrice);
  const { error: dataError } = useMarketData();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastDuration, setToastDuration] = useState(3200);
  const [snapFlash, setSnapFlash] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Background process for Live Data refresh
  useEffect(() => {
    if (!liveEnabled) return;

    let active = true;
    let timeoutId: number | undefined;
    const updatedSymbols = new Set<string>();

    const updateNext = async () => {
      if (!active) return;

      const visible = getVisibleSymbols();
      if (visible.length === 0) {
        timeoutId = window.setTimeout(updateNext, config.liveData.idleRetryIntervalMs);
        return;
      }

      let nextSym = visible.find((sym) => !updatedSymbols.has(sym));
      if (!nextSym) {
        updatedSymbols.clear();
        nextSym = visible[0];
      }

      if (nextSym) {
        updatedSymbols.add(nextSym);
        try {
          const res = await fetchYahooFinancePrice(nextSym);
          if (res && active) {
            updatePrice(nextSym, res.price, res.d1, res.updatedAt);
          }
        } catch (err) {
          console.warn(`Failed to fetch live price for ${nextSym}:`, err);
        }
      }

      timeoutId = window.setTimeout(updateNext, config.liveData.refreshIntervalMs);
    };

    updateNext();

    return () => {
      active = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [liveEnabled, updatePrice]);

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

  return (
    <div className="app">
      <div className={`snap-flash${snapFlash ? ' on' : ''}`} />
      <Toast
        message={toastMessage || dataError}
        durationMs={toastDuration}
        onClose={() => setToastMessage(null)}
      />
      <TradingViewModal />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="wrap" ref={wrapRef}>
        <Header
          loading={store.loading}
          generatedAt={store.generatedAt}
          badgeOk={dataReady}
          liveEnabled={liveEnabled}
          onToggleLive={() => setLiveEnabled((prev) => !prev)}
          onSnap={handleSnap}
          onShareX={handleShareX}
          onCopy={handleCopy}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="quote-bar">
          <div className="quote-icon">
            <Icon name="auto_awesome" size="sm" />
          </div>
          <div className="quote-text">"If you Fail to Plan, You are Planning to Fail"</div>
          <div className="quote-author">— Benjamin Franklin</div>
          <div className="quote-icon">
            <Icon name="auto_awesome" size="sm" />
          </div>
        </div>

        <MacroSection />
        <MacroDivider />
        <EquitiesSection />
        <MacroDivider />
        <BreadthSection breadth={store.breadth} />
        <MacroDivider />
        <WatchlistSection />
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

const MemoizedDashboardContent = memo(DashboardContent);

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SettingsProvider>
          <SettingsSyncProvider>
            <ChartModalProvider>
              <SymbolPreviewProvider>
                <MemoizedDashboardContent />
                <SymbolPreviewOverlay />
              </SymbolPreviewProvider>
            </ChartModalProvider>
          </SettingsSyncProvider>
        </SettingsProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;

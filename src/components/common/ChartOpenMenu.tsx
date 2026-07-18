import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { buildYahooFinanceQuoteUrl, toYahooFinanceSymbol } from '../../services/api';
import { buildTradingViewChartUrl, toTradingViewSymbol } from '../../utils/tradingView';
import { Icon } from './Icon';

interface ChartOpenMenuProps {
  rawSym: string;
  onOpenChange?: (open: boolean) => void;
}

export function ChartOpenMenu({ rawSym, onOpenChange }: ChartOpenMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const setMenuOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    setOpen(false);
    onOpenChange?.(false);
  }, [rawSym, onOpenChange]);

  const updateMenuPosition = () => {
    const trigger = rootRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const tvUrl = buildTradingViewChartUrl(toTradingViewSymbol(rawSym));
  const yahooUrl = buildYahooFinanceQuoteUrl(toYahooFinanceSymbol(rawSym));

  return (
    <div ref={rootRef} className="chart-open-menu">
      <button
        type="button"
        className="chart-open-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setMenuOpen(!open)}
      >
        OPEN
        <Icon name="expand_more" size="xs" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="chart-open-menu-dropdown"
            style={menuStyle}
            role="menu"
          >
            <a
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              TradingView
            </a>
            <a
              href={yahooUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Yahoo Finance
            </a>
          </div>,
          document.body,
        )}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { buildYahooFinanceQuoteUrl, toYahooFinanceSymbol } from '../../services/api';
import { buildTradingViewChartUrl, toTradingViewSymbol } from '../../utils/tradingView';
import { blurActiveElement } from '../../utils/focus';
import { useOverlayDismiss } from '../../utils/overlayStack';
import { usePenCompatibleClick, usePenPointerUp } from '../../utils/penClick';
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
    if (!next) blurActiveElement();
    setOpen(next);
    onOpenChange?.(next);
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useOverlayDismiss(open, closeMenu);

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

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const tvUrl = buildTradingViewChartUrl(toTradingViewSymbol(rawSym));
  const yahooUrl = buildYahooFinanceQuoteUrl(toYahooFinanceSymbol(rawSym));

  const toggleMenu = useCallback(() => setMenuOpen(!open), [open]);
  const triggerPenClick = usePenCompatibleClick(toggleMenu);

  const openTvLink = useCallback(() => {
    setMenuOpen(false);
    window.open(tvUrl, '_blank', 'noopener,noreferrer');
  }, [tvUrl]);

  const openYahooLink = useCallback(() => {
    setMenuOpen(false);
    window.open(yahooUrl, '_blank', 'noopener,noreferrer');
  }, [yahooUrl]);

  const tvPenUp = usePenPointerUp(openTvLink);
  const yahooPenUp = usePenPointerUp(openYahooLink);

  return (
    <div ref={rootRef} className="chart-open-menu">
      <button
        type="button"
        className="chart-open-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        {...triggerPenClick}
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
              onClick={closeMenu}
              onPointerUp={tvPenUp}
            >
              TradingView
            </a>
            <a
              href={yahooUrl}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={closeMenu}
              onPointerUp={yahooPenUp}
            >
              Yahoo Finance
            </a>
          </div>,
          document.body,
        )}
    </div>
  );
}

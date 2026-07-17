import React, { useState } from 'react';
import { colors } from '../../utils/formatting';
import { Icon } from './Icon';
import { CardSearchContext } from './CardSearchContext';

interface CardCopyButtonProps {
  symbols: string[];
}

export const CardCopyButton: React.FC<CardCopyButtonProps> = ({ symbols }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const csv = symbols.filter(Boolean).join(',');
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy symbols:', err);
    }
  };

  return (
    <button
      type="button"
      className="table-expand-btn"
      title="Copy symbols as CSV"
      aria-label="Copy symbols as CSV"
      onClick={handleCopy}
      style={{
        color: copied ? colors.green : undefined,
        borderColor: copied ? colors.green : undefined,
        background: copied ? 'var(--green-dim-bg)' : undefined,
      }}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size="sm" />
    </button>
  );
};



interface CardProps {
  label: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
  headerAction?: React.ReactNode;
  symbols?: string[];
}

export const Card: React.FC<CardProps> = ({ label, children, style, headerAction, symbols }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <CardSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      <div
        style={{
          background: colors.bg2,
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: '9px',
          ...style,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '7px 11px',
            fontSize: '10px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: colors.accent,
            background: colors.bg3,
            borderBottom: `1px solid ${colors.border}`,
            fontWeight: 500,
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          {isSearchOpen ? (
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '2px',
                width: '120px',
                outline: 'none',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
              autoFocus
            />
          ) : (
            <span>{label}</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {symbols && symbols.length > 0 && (
              <>
                <button
                  type="button"
                  className="table-expand-btn"
                  title="Search section"
                  aria-label="Search section"
                  onClick={() => {
                    setIsSearchOpen(!isSearchOpen);
                    if (isSearchOpen) setSearchQuery('');
                  }}
                  style={{
                    color: isSearchOpen ? colors.accent : undefined,
                    borderColor: isSearchOpen ? colors.accent : undefined,
                    background: isSearchOpen ? 'var(--accent-subtle-bg)' : undefined,
                  }}
                >
                  <Icon name="search" size="sm" />
                </button>
                <CardCopyButton symbols={symbols} />
              </>
            )}
            {headerAction}
          </div>
        </div>
        {children}
      </div>
    </CardSearchContext.Provider>
  );
};


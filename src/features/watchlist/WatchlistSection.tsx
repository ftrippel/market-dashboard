import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardLabel, Icon, Section } from '../../components/common';
import { SortableHeader, type SortOrder } from '../../components/common/SortableHeader';
import { PctCell } from '../../components/common/PctCell';
import { SymbolLink } from '../../components/common/TradingViewModal';
import { getDisplayName, getSymbolMeta } from '../../data/symbolMaps';
import { useMarketStore } from '../../store/marketStore';
import type { MarketState } from '../../types';
import { colors } from '../../utils/formatting';
import { usePenCompatibleClick } from '../../utils/penClick';
import {
  findMarketData,
  getWatchlistMetrics,
  matchesWatchlistSearch,
  matchesWatchlistTags,
  watchlistItemToMarketData,
} from './resolveMarketData';
import { useWatchlistQuotes } from './useWatchlistQuotes';
import { useWatchlists } from './useWatchlists';
import { parseTags } from './watchlistStorage';
import type { WatchlistItem } from './types';
import type { WatchlistQuote } from './useWatchlistQuotes';

type WatchlistSortKey = 'name' | 'd1' | 'w1' | 'hi52' | 'ytd' | 'tags' | 'comment';

function compareWatchlistItems(
  a: WatchlistItem,
  b: WatchlistItem,
  key: WatchlistSortKey,
  order: SortOrder,
  store: MarketState,
  quotes: Record<string, WatchlistQuote>,
): number {
  let cmp = 0;

  if (key === 'name') {
    const aName = getDisplayName(a.sym, watchlistItemToMarketData(a, store, quotes).name);
    const bName = getDisplayName(b.sym, watchlistItemToMarketData(b, store, quotes).name);
    cmp = aName.localeCompare(bName);
  } else if (key === 'tags') {
    cmp = a.tags.join(', ').localeCompare(b.tags.join(', '));
  } else if (key === 'comment') {
    cmp = (a.comment ?? '').localeCompare(b.comment ?? '');
  } else {
    const metricsA = getWatchlistMetrics(a, store, quotes);
    const metricsB = getWatchlistMetrics(b, store, quotes);
    const aVal = Number(metricsA[key] ?? NaN);
    const bVal = Number(metricsB[key] ?? NaN);
    const aMissing = Number.isNaN(aVal);
    const bMissing = Number.isNaN(bVal);
    if (aMissing && bMissing) cmp = 0;
    else if (aMissing) cmp = 1;
    else if (bMissing) cmp = -1;
    else cmp = aVal - bVal;
  }

  return order === 'asc' ? cmp : -cmp;
}

function EditableWatchlistTitle({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setDraft(trimmed || name);
    setEditing(false);
  }, [draft, name, onRename]);

  const startEditing = useCallback(() => {
    setDraft(name);
    setEditing(true);
  }, [name]);

  const startPenClick = usePenCompatibleClick(startEditing);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="fi watchlist-title-rename"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(name);
            setEditing(false);
          }
        }}
        aria-label="Rename watchlist"
      />
    );
  }

  return (
    <button
      type="button"
      className="watchlist-title-btn"
      title="Click to rename"
      {...startPenClick}
    >
      <CardLabel>{name}</CardLabel>
    </button>
  );
}

function WatchlistTab({
  id,
  name,
  isActive,
  canReorder,
  isDragging,
  isDragOver,
  onSelect,
  onRename,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  id: string;
  name: string;
  isActive: boolean;
  canReorder: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) onRename(id, trimmed);
    setDraft(trimmed || name);
    setEditing(false);
  }, [draft, id, name, onRename]);

  const startEditing = useCallback(() => {
    setDraft(name);
    setEditing(true);
  }, [name]);

  const selectPenClick = usePenCompatibleClick(() => onSelect(id));

  if (editing) {
    return (
      <div className="watchlist-tab-wrap">
        <input
          ref={inputRef}
          className="fi watchlist-tab-rename"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            }
            if (e.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          aria-label="Rename watchlist"
        />
      </div>
    );
  }

  return (
    <div
      className={`watchlist-tab-wrap${canReorder ? ' watchlist-tab-wrap--draggable' : ''}${isDragging ? ' is-dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
      draggable={canReorder}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(id);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(id);
      }}
    >
      <button
        type="button"
        className={`watchlist-tab${isActive ? ' on' : ''}`}
        {...selectPenClick}
        onDoubleClick={(e) => {
          e.preventDefault();
          startEditing();
        }}
        title={canReorder ? 'Drag to reorder · double-click to rename' : 'Double-click to rename'}
      >
        {name}
      </button>
    </div>
  );
}

function WatchlistTabs({
  watchlists,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onReorder,
}: {
  watchlists: { id: string; name: string }[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
    setCreating(false);
  };

  const createPenClick = usePenCompatibleClick(() => setCreating(true));

  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const handleDragOver = useCallback((id: string) => {
    setDragOverId(id);
  }, []);

  const handleDrop = useCallback(
    (toId: string) => {
      if (dragId) onReorder(dragId, toId);
      setDragId(null);
      setDragOverId(null);
    },
    [dragId, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDragOverId(null);
  }, []);

  const canReorder = watchlists.length > 1;

  return (
    <div className="watchlist-tabs">
      {watchlists.map((w) => (
        <WatchlistTab
          key={w.id}
          id={w.id}
          name={w.name}
          isActive={w.id === activeId}
          canReorder={canReorder}
          isDragging={dragId === w.id}
          isDragOver={dragOverId === w.id && dragId !== w.id}
          onSelect={onSelect}
          onRename={onRename}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
      {creating ? (
        <div className="watchlist-create-inline">
          <input
            className="fi watchlist-create-input"
            type="text"
            placeholder="Watchlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') {
                setCreating(false);
                setNewName('');
              }
            }}
            autoFocus
          />
          <button type="button" className="btn watchlist-create-btn" onClick={handleCreate}>
            Create
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="watchlist-tab watchlist-tab--new"
          title="New watchlist"
          {...createPenClick}
        >
          + New
        </button>
      )}
    </div>
  );
}

function TagChip({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const penClick = usePenCompatibleClick(onClick);
  return (
    <button type="button" className={`watchlist-chip${isActive ? ' on' : ''}`} {...penClick}>
      {label}
    </button>
  );
}

function TagChips({
  tags,
  activeTags,
  onToggle,
  onClear,
}: {
  tags: string[];
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="watchlist-tags">
      <TagChip label="All" isActive={activeTags.length === 0} onClick={onClear} />
      {tags.map((tag) => (
        <TagChip
          key={tag}
          label={tag}
          isActive={activeTags.some((t) => t.toLowerCase() === tag.toLowerCase())}
          onClick={() => onToggle(tag)}
        />
      ))}
    </div>
  );
}

function WatchlistTagChip({
  tag,
  highlighted,
  onRemove,
}: {
  tag: string;
  highlighted: boolean;
  onRemove: () => void;
}) {
  const removePenClick = usePenCompatibleClick(onRemove);

  return (
    <span className={`watchlist-item-tag${highlighted ? ' highlighted' : ''}`}>
      <span className="watchlist-item-tag-label">{tag}</span>
      <button
        type="button"
        className="watchlist-item-tag-remove"
        title={`Remove ${tag}`}
        aria-label={`Remove ${tag}`}
        {...removePenClick}
      >
        <Icon name="close" size="xs" />
      </button>
    </span>
  );
}

function EditableWatchlistTags({
  tags,
  activeTags = [],
  onChange,
}: {
  tags: string[];
  activeTags?: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const removeTag = useCallback(
    (tag: string) => {
      onChange(tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    },
    [tags, onChange],
  );

  const commitDraft = useCallback(() => {
    const newTags = parseTags(draft);
    if (newTags.length === 0) return;

    const merged = [...tags];
    for (const tag of newTags) {
      if (!merged.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        merged.push(tag);
      }
    }
    onChange(merged);
    setDraft('');
  }, [draft, tags, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
      return;
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
      return;
    }
    if (e.key === 'Escape') {
      setDraft('');
      inputRef.current?.blur();
    }
  };

  return (
    <div className="watchlist-item-tags watchlist-item-tags--editable">
      {tags.map((tag) => (
        <WatchlistTagChip
          key={tag}
          tag={tag}
          highlighted={activeTags.some((t) => t.toLowerCase() === tag.toLowerCase())}
          onRemove={() => removeTag(tag)}
        />
      ))}
      <input
        ref={inputRef}
        className="watchlist-tags-builder"
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={tags.length === 0 ? 'Add tag…' : '+ tag'}
        aria-label="Add tag"
      />
    </div>
  );
}

function EditableWatchlistComment({
  comment,
  onChange,
}: {
  comment: string;
  onChange: (comment: string) => void;
}) {
  const [draft, setDraft] = useState(comment);

  useEffect(() => {
    setDraft(comment);
  }, [comment]);

  const commit = useCallback(() => {
    onChange(draft);
  }, [draft, onChange]);

  return (
    <input
      className="fi watchlist-comment-input"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setDraft(comment);
          e.currentTarget.blur();
        }
      }}
      placeholder="Add comment…"
      aria-label="Edit comment"
    />
  );
}

function WatchlistRow({
  item,
  activeTags,
  siblings,
  quotes,
  onRemove,
  onUpdateTags,
  onUpdateComment,
}: {
  item: WatchlistItem;
  activeTags: string[];
  siblings: { sym: string; name: string }[];
  quotes: Record<string, WatchlistQuote>;
  onRemove: (sym: string) => void;
  onUpdateTags: (sym: string, tags: string[]) => void;
  onUpdateComment: (sym: string, comment: string) => void;
}) {
  const store = useMarketStore();
  const data = watchlistItemToMarketData(item, store, quotes);
  const existing = findMarketData(store, item.sym);
  const quote = quotes[item.sym];
  const d1 = existing?.d1 ?? quote?.d1;
  const w1 = existing?.w1 ?? quote?.w1;
  const hi52 = existing?.hi52 ?? quote?.hi52;
  const ytd = existing?.ytd ?? quote?.ytd;
  const meta = getSymbolMeta(item.sym);
  const displayName = getDisplayName(item.sym, data.name);
  const removePenClick = usePenCompatibleClick(() => onRemove(item.sym));
  const handleSetTags = useCallback(
    (tags: string[]) => onUpdateTags(item.sym, tags),
    [item.sym, onUpdateTags],
  );
  const handleSetComment = useCallback(
    (comment: string) => onUpdateComment(item.sym, comment),
    [item.sym, onUpdateComment],
  );

  return (
    <tr data-symbol={item.sym} style={{ borderBottom: `1px solid ${colors.rowBorder}` }}>
      <td className="watchlist-td" style={{ textAlign: 'left' }}>
        <SymbolLink sym={item.sym} name={displayName} siblings={siblings} />
        <span style={{ color: colors.text3, fontSize: '10px', display: 'block', letterSpacing: '0.5px' }}>
          {meta.sym || item.sym}
        </span>
      </td>
      <td className="watchlist-td" style={{ textAlign: 'right' }}>
        <PctCell value={d1} />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'right' }}>
        <PctCell value={w1} />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'right' }}>
        <PctCell value={hi52} maxPct={30} />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'right' }}>
        <PctCell value={ytd} maxPct={20} />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'left' }}>
        <EditableWatchlistTags tags={item.tags} activeTags={activeTags} onChange={handleSetTags} />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'left' }}>
        <EditableWatchlistComment
          comment={item.comment ?? ''}
          onChange={handleSetComment}
        />
      </td>
      <td className="watchlist-td" style={{ textAlign: 'center' }}>
        <button
          type="button"
          className="table-expand-btn watchlist-remove-btn"
          title="Remove from watchlist"
          aria-label={`Remove ${item.sym}`}
          {...removePenClick}
        >
          <Icon name="close" size="xs" />
        </button>
      </td>
    </tr>
  );
}

export function WatchlistSection({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const store = useMarketStore();
  const {
    watchlists,
    activeWatchlist,
    activeId,
    setActiveId,
    createNewWatchlist,
    deleteWatchlist,
    reorderWatchlists,
    renameWatchlist,
    addItem,
    removeItem,
    setItemTags,
    setItemComment,
    allTags,
  } = useWatchlists();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [symInput, setSymInput] = useState('');
  const [addTags, setAddTags] = useState<string[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: WatchlistSortKey; order: SortOrder }>({
    key: 'w1',
    order: 'desc',
  });

  const handleSort = useCallback((key: WatchlistSortKey) => {
    setSort((prev) => ({
      key,
      order: prev.key === key && prev.order === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const allSymbols = useMemo(
    () => activeWatchlist?.items.map((item) => item.sym) ?? [],
    [activeWatchlist],
  );
  const quotes = useWatchlistQuotes(allSymbols, store, liveEnabled);

  const filteredItems = useMemo(() => {
    if (!activeWatchlist) return [];
    return activeWatchlist.items.filter(
      (item) =>
        matchesWatchlistSearch(item, store, searchQuery) &&
        matchesWatchlistTags(item, activeTags),
    );
  }, [activeWatchlist, store, searchQuery, activeTags]);

  const sortedItems = useMemo(
    () =>
      [...filteredItems].sort((a, b) =>
        compareWatchlistItems(a, b, sort.key, sort.order, store, quotes),
      ),
    [filteredItems, sort, store, quotes],
  );

  const siblings = useMemo(
    () =>
      sortedItems.map((item) => ({
        sym: item.sym,
        name: getDisplayName(item.sym, watchlistItemToMarketData(item, store, quotes).name),
      })),
    [sortedItems, store, quotes],
  );

  const handleAdd = useCallback(() => {
    const sym = symInput.trim();
    if (!sym) {
      setAddError('Enter a symbol');
      return;
    }
    if (activeWatchlist?.items.some((item) => item.sym === sym.toUpperCase())) {
      setAddError('Symbol already in watchlist');
      return;
    }
    addItem(sym, addTags, commentInput);
    setSymInput('');
    setAddTags([]);
    setCommentInput('');
    setAddError(null);
  }, [symInput, addTags, commentInput, activeWatchlist, addItem]);

  const handleToggleTag = useCallback((tag: string) => {
    setActiveTags((prev) => {
      const key = tag.toLowerCase();
      const exists = prev.some((t) => t.toLowerCase() === key);
      if (exists) return prev.filter((t) => t.toLowerCase() !== key);
      return [...prev, tag];
    });
  }, []);

  const handleClearTags = useCallback(() => setActiveTags([]), []);

  const handleSelectWatchlist = useCallback(
    (id: string) => {
      setActiveId(id);
      setSearchQuery('');
      setActiveTags([]);
      setAddError(null);
    },
    [setActiveId],
  );

  const handleDeleteWatchlist = useCallback(
    (id: string) => {
      const watchlist = watchlists.find((w) => w.id === id);
      const name = watchlist?.name ?? 'this watchlist';
      if (!window.confirm(`Delete "${name}" and all its symbols?`)) return;
      deleteWatchlist(id);
    },
    [watchlists, deleteWatchlist],
  );

  const handleRemoveItem = useCallback(
    (sym: string) => {
      if (!window.confirm(`Remove ${sym} from the watchlist?`)) return;
      removeItem(sym);
    },
    [removeItem],
  );

  const handleRenameActive = useCallback(
    (name: string) => {
      if (activeWatchlist) renameWatchlist(activeWatchlist.id, name);
    },
    [activeWatchlist, renameWatchlist],
  );

  const addPenClick = usePenCompatibleClick(handleAdd);
  const deleteWatchlistPenClick = usePenCompatibleClick(() => handleDeleteWatchlist(activeId));

  if (!activeWatchlist) return null;

  return (
    <Section number="04" title="Watchlist" subtitle="">
      <Card
        label={
          <EditableWatchlistTitle name={activeWatchlist.name} onRename={handleRenameActive} />
        }
      >
        <div className="watchlist-toolbar">
          <WatchlistTabs
            watchlists={watchlists}
            activeId={activeId}
            onSelect={handleSelectWatchlist}
            onCreate={createNewWatchlist}
            onRename={renameWatchlist}
            onReorder={reorderWatchlists}
          />

          <div className="watchlist-filters">
            <div className="watchlist-search-wrap">
              <Icon name="search" size="sm" className="watchlist-search-icon" />
              <input
                className="fi watchlist-search"
                type="text"
                placeholder="Search symbols, names, tags, comments…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <TagChips
              tags={allTags}
              activeTags={activeTags}
              onToggle={handleToggleTag}
              onClear={handleClearTags}
            />
          </div>

          <div className="watchlist-add">
            <div className="watchlist-add-fields">
              <div className="fg watchlist-add-field">
                <label className="fl">Symbol</label>
                <input
                  className="fi"
                  type="text"
                  placeholder="e.g. AAPL"
                  value={symInput}
                  onChange={(e) => {
                    setSymInput(e.target.value);
                    setAddError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                />
              </div>
              <div className="fg watchlist-add-field watchlist-add-field--tags">
                <label className="fl">Tags</label>
                <EditableWatchlistTags tags={addTags} onChange={setAddTags} />
              </div>
              <div className="fg watchlist-add-field">
                <label className="fl">Comment</label>
                <input
                  className="fi"
                  type="text"
                  placeholder="Add comment…"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                  }}
                />
              </div>
            </div>
            <button type="button" className="btn watchlist-add-btn" {...addPenClick}>
              Add
            </button>
          </div>
          {addError && <div className="watchlist-add-error">{addError}</div>}

          {activeWatchlist.items.length === 0 ? (
            <div className="watchlist-empty">
              No symbols yet — add one above to start your watchlist.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="watchlist-empty">No symbols match your search or tag filters.</div>
          ) : (
            <div className="watchlist-table-wrap">
              <div className="table-scroll">
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                >
                  <thead>
                    <tr>
                      <SortableHeader
                        label="Symbol"
                        sortKey="name"
                        activeKey={sort.key}
                        order={sort.order}
                        align="left"
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="1D%"
                        sortKey="d1"
                        activeKey={sort.key}
                        order={sort.order}
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="1W%"
                        sortKey="w1"
                        activeKey={sort.key}
                        order={sort.order}
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="52W Hi%"
                        sortKey="hi52"
                        activeKey={sort.key}
                        order={sort.order}
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="YTD%"
                        sortKey="ytd"
                        activeKey={sort.key}
                        order={sort.order}
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="Tags"
                        sortKey="tags"
                        activeKey={sort.key}
                        order={sort.order}
                        align="left"
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <SortableHeader
                        label="Comment"
                        sortKey="comment"
                        activeKey={sort.key}
                        order={sort.order}
                        align="left"
                        onSort={handleSort}
                        thClassName="watchlist-th"
                      />
                      <th className="watchlist-th" style={{ textAlign: 'center', width: '48px' }}>
                        {' '}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedItems.map((item) => (
                      <WatchlistRow
                        key={item.sym}
                        item={item}
                        activeTags={activeTags}
                        siblings={siblings}
                        quotes={quotes}
                        onRemove={handleRemoveItem}
                        onUpdateTags={setItemTags}
                        onUpdateComment={setItemComment}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {watchlists.length > 1 && (
            <div className="watchlist-footer">
              <button
                type="button"
                className="btn watchlist-delete-btn"
                {...deleteWatchlistPenClick}
              >
                <Icon name="close" size="xs" /> Delete &ldquo;{activeWatchlist.name}&rdquo;
              </button>
            </div>
          )}
        </div>
      </Card>
    </Section>
  );
}

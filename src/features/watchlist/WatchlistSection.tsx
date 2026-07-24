import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Card, CardLabel, Icon, Section } from '../../components/common';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { SortableHeader, type SortOrder } from '../../components/common/SortableHeader';
import { PctCell } from '../../components/common/PctCell';
import { SymbolLink } from '../../components/common/TradingViewModal';
import { getDisplayName, getSymbolMeta } from '../../data/symbolMaps';
import { useMarketStore } from '../../store/marketStore';
import type { MarketState } from '../../types';
import { colors } from '../../utils/formatting';
import { useScrollLock } from '../../hooks/useScrollLock';
import { blurActiveElement, dismissOverlay } from '../../utils/focus';
import { useOverlayDismiss } from '../../utils/overlayStack';
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

const WATCHLIST_NOTE_MAX_INLINE_HEIGHT = 128;
const WATCHLIST_ITEM_MENU_VIEWPORT_MARGIN = 8;
const HIDDEN_WATCHLIST_ITEM_MENU_STYLE: CSSProperties = {
  position: 'fixed',
  visibility: 'hidden',
};

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
  onRename,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const penClick = usePenCompatibleClick(onClick);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [editing, label]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== label) onRename?.(trimmed);
    setDraft(trimmed || label);
    setEditing(false);
  }, [draft, label, onRename]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`watchlist-chip watchlist-chip-rename${isActive ? ' on' : ''}`}
        style={{ width: `${Math.max(draft.length, label.length, 3) + 2}ch` }}
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
            setDraft(label);
            setEditing(false);
          }
        }}
        aria-label={`Rename tag ${label}`}
      />
    );
  }

  return (
    <button
      type="button"
      className={`watchlist-chip${isActive ? ' on' : ''}`}
      {...penClick}
      onDoubleClick={
        onRename
          ? (e) => {
              e.preventDefault();
              setDraft(label);
              setEditing(true);
            }
          : undefined
      }
      title={onRename ? 'Double-click to rename' : undefined}
    >
      {label}
    </button>
  );
}

function TagChips({
  tags,
  activeTags,
  onToggle,
  onClear,
  onRename,
}: {
  tags: string[];
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  onRename: (tag: string, name: string) => void;
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
          onRename={(name) => onRename(tag, name)}
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
  const singleLineComment = comment.replace(/\r?\n/g, ' ');
  const [draft, setDraft] = useState(singleLineComment);

  useEffect(() => {
    setDraft(singleLineComment);
  }, [singleLineComment]);

  const commit = useCallback(() => {
    if (draft !== singleLineComment) onChange(draft);
  }, [draft, onChange, singleLineComment]);

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
          setDraft(singleLineComment);
          e.currentTarget.blur();
        }
      }}
      placeholder="Add comment…"
      aria-label="Edit comment"
    />
  );
}

function CommentEditorDialog({
  title,
  comment,
  placeholder,
  unsavedMessage,
  onSave,
  onClose,
}: {
  title: string;
  comment: string;
  placeholder: string;
  unsavedMessage: string;
  onSave: (comment: string) => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(comment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedComment = comment.trim();
  const titleId = 'comment-editor-dialog-title';

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  const close = useCallback(() => dismissOverlay(onClose), [onClose]);

  const requestClose = useCallback(async () => {
    if (draft.trim() === savedComment) {
      close();
      return;
    }

    if (
      await confirm({
        title: 'Unsaved changes',
        message: unsavedMessage,
        confirmLabel: 'Save',
        cancelLabel: 'Discard',
      })
    ) {
      onSave(draft);
    }
    close();
  }, [close, confirm, draft, onSave, savedComment, unsavedMessage]);

  const save = useCallback(() => {
    onSave(draft);
    close();
  }, [close, draft, onSave]);

  useOverlayDismiss(true, () => {
    void requestClose();
  });
  useScrollLock(true);

  const closePenClick = usePenCompatibleClick(() => {
    void requestClose();
  });
  const savePenClick = usePenCompatibleClick(save);

  return createPortal(
    <div
      className="tv-modal open watchlist-comment-dialog"
      data-scroll-lock-overlay
    >
      <div
        className="watchlist-comment-dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="watchlist-comment-dialog-header">
          <div id={titleId}>{title}</div>
          <button type="button" aria-label="Close comment editor" {...closePenClick}>
            <Icon name="close" size="xs" />
          </button>
        </div>
        <div className="watchlist-comment-dialog-body">
          <textarea
            ref={textareaRef}
            className="fi watchlist-comment-dialog-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                save();
              }
            }}
            placeholder={placeholder}
            aria-label={title}
          />
        </div>
        <div className="watchlist-comment-dialog-actions">
          <span>Ctrl/⌘ + Enter to save</span>
          <button type="button" className="btn" {...closePenClick}>
            Cancel
          </button>
          <button type="button" className="btn" {...savePenClick}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WatchlistNoteEditor({
  id,
  comment,
  onChange,
  onExpand,
}: {
  id: string;
  comment: string;
  onChange: (comment: string) => void;
  onExpand: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showExpand, setShowExpand] = useState(false);

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const overflows = scrollHeight > WATCHLIST_NOTE_MAX_INLINE_HEIGHT;
    setShowExpand(overflows);
    textarea.style.height = `${Math.min(scrollHeight, WATCHLIST_NOTE_MAX_INLINE_HEIGHT)}px`;
    textarea.style.overflowY = overflows ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    syncHeight();
  }, [comment, syncHeight]);

  const expandPenClick = usePenCompatibleClick(onExpand);

  return (
    <div className="watchlist-note-editor">
      <textarea
        ref={textareaRef}
        id={id}
        className="fi watchlist-note-input"
        rows={1}
        value={comment}
        onChange={(event) => onChange(event.target.value)}
        onInput={syncHeight}
        placeholder="Add notes for this watchlist…"
      />
      {showExpand && (
        <button
          type="button"
          className="table-expand-btn watchlist-note-expand-btn"
          title="Open watchlist comment editor"
          aria-label="Open watchlist comment editor"
          {...expandPenClick}
        >
          <Icon name="open_in_full" size="xs" />
        </button>
      )}
    </div>
  );
}

function WatchlistItemMenu({
  item,
  onRequestMove,
  onRemove,
}: {
  item: WatchlistItem;
  onRequestMove: (sym: string) => void;
  onRemove: (sym: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>(
    HIDDEN_WATCHLIST_ITEM_MENU_STYLE,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    blurActiveElement();
    setOpen(false);
  }, []);

  useOverlayDismiss(open, closeMenu);

  useEffect(() => {
    setOpen(false);
  }, [item.sym]);

  const updateMenuPosition = useCallback(() => {
    const trigger = rootRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = WATCHLIST_ITEM_MENU_VIEWPORT_MARGIN;
    const left = Math.max(
      margin,
      Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - margin),
    );
    const belowTop = triggerRect.bottom + 4;
    const aboveTop = triggerRect.top - menuRect.height - 4;
    const top =
      belowTop + menuRect.height <= window.innerHeight - margin
        ? belowTop
        : Math.max(margin, aboveTop);

    setMenuStyle({ position: 'fixed', top, left, visibility: 'visible' });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        closeMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, closeMenu]);

  const toggleMenu = useCallback(() => {
    if (!open) setMenuStyle(HIDDEN_WATCHLIST_ITEM_MENU_STYLE);
    setOpen(!open);
  }, [open]);
  const triggerPenClick = usePenCompatibleClick(toggleMenu);
  const movePenClick = usePenCompatibleClick(() => {
    closeMenu();
    onRequestMove(item.sym);
  });
  const removePenClick = usePenCompatibleClick(() => {
    closeMenu();
    onRemove(item.sym);
  });

  return (
    <div ref={rootRef} className="watchlist-item-menu">
      <button
        type="button"
        className="table-expand-btn watchlist-item-menu-trigger"
        title={`Actions for ${item.sym}`}
        aria-label={`Actions for ${item.sym}`}
        aria-expanded={open}
        aria-haspopup="menu"
        {...triggerPenClick}
      >
        …
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="watchlist-item-menu-dropdown"
            style={menuStyle}
            role="menu"
            aria-label={`Actions for ${item.sym}`}
          >
            <button
              type="button"
              className="watchlist-item-menu-action"
              role="menuitem"
              {...movePenClick}
            >
              Move
            </button>
            <div className="watchlist-item-menu-divider" />
            <button
              type="button"
              className="watchlist-item-menu-action watchlist-item-menu-delete"
              role="menuitem"
              {...removePenClick}
            >
              Delete
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function WatchlistMoveDialogOption({
  name,
  alreadyContainsSymbol,
  onSelect,
}: {
  name: string;
  alreadyContainsSymbol: boolean;
  onSelect: () => void;
}) {
  const selectPenClick = usePenCompatibleClick(onSelect);

  return (
    <button
      type="button"
      className="watchlist-move-dialog-option"
      disabled={alreadyContainsSymbol}
      title={alreadyContainsSymbol ? `${name} already contains this symbol` : `Move to ${name}`}
      {...selectPenClick}
    >
      <span>{name}</span>
      {alreadyContainsSymbol && (
        <span className="watchlist-move-dialog-hint">Already added</span>
      )}
    </button>
  );
}

function WatchlistMoveDialog({
  item,
  watchlists,
  sourceWatchlistId,
  onMove,
  onClose,
}: {
  item: WatchlistItem;
  watchlists: { id: string; name: string; items: WatchlistItem[] }[];
  sourceWatchlistId: string;
  onMove: (targetWatchlistId: string) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const targets = watchlists.filter((watchlist) => watchlist.id !== sourceWatchlistId);
  const titleId = 'watchlist-move-dialog-title';
  const descriptionId = 'watchlist-move-dialog-description';
  const close = useCallback(() => dismissOverlay(onClose), [onClose]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      const firstAvailableTarget =
        listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      (firstAvailableTarget ?? closeButtonRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, []);

  useOverlayDismiss(true, close);
  useScrollLock(true);

  const closePenClick = usePenCompatibleClick(close);
  const backdropPenClick = usePenCompatibleClick((event) => {
    if (event.target === event.currentTarget) close();
  });

  return createPortal(
    <div
      className="tv-modal open watchlist-move-dialog"
      data-scroll-lock-overlay
      {...backdropPenClick}
    >
      <div
        className="watchlist-move-dialog-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="watchlist-move-dialog-header">
          <div id={titleId}>Move {item.sym}</div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close move dialog"
            {...closePenClick}
          >
            <Icon name="close" size="xs" />
          </button>
        </div>
        <div id={descriptionId} className="watchlist-move-dialog-description">
          Choose a destination watchlist.
        </div>
        <div ref={listRef} className="watchlist-move-dialog-list">
          {targets.length === 0 ? (
            <div className="watchlist-move-dialog-empty">No other watchlists available.</div>
          ) : (
            targets.map((target) => (
              <WatchlistMoveDialogOption
                key={target.id}
                name={target.name}
                alreadyContainsSymbol={target.items.some(
                  (candidate) => candidate.sym === item.sym,
                )}
                onSelect={() => dismissOverlay(() => onMove(target.id))}
              />
            ))
          )}
        </div>
        <div className="watchlist-move-dialog-actions">
          <button type="button" className="btn" {...closePenClick}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WatchlistRow({
  item,
  activeTags,
  siblings,
  quotes,
  onRemove,
  onRequestMove,
  onUpdateTags,
  onUpdateComment,
  onExpandComment,
}: {
  item: WatchlistItem;
  activeTags: string[];
  siblings: { sym: string; name: string }[];
  quotes: Record<string, WatchlistQuote>;
  onRemove: (sym: string) => void;
  onRequestMove: (sym: string) => void;
  onUpdateTags: (sym: string, tags: string[]) => void;
  onUpdateComment: (sym: string, comment: string) => void;
  onExpandComment: (sym: string) => void;
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
  const expandCommentPenClick = usePenCompatibleClick(() => onExpandComment(item.sym));
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
        <div className="watchlist-comment-editor">
          <EditableWatchlistComment
            comment={item.comment ?? ''}
            onChange={handleSetComment}
          />
          <button
            type="button"
            className="table-expand-btn watchlist-comment-expand-btn"
            title={`Open ${item.sym} comment editor`}
            aria-label={`Open ${item.sym} comment editor`}
            {...expandCommentPenClick}
          >
            <Icon name="open_in_full" size="xs" />
          </button>
        </div>
      </td>
      <td className="watchlist-td" style={{ textAlign: 'center' }}>
        <WatchlistItemMenu
          item={item}
          onRequestMove={onRequestMove}
          onRemove={onRemove}
        />
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
    setWatchlistComment,
    addItem,
    removeItem,
    moveItem,
    setItemTags,
    renameTag,
    setItemComment,
    allTags,
  } = useWatchlists();
  const confirm = useConfirm();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [symInput, setSymInput] = useState('');
  const [addTags, setAddTags] = useState<string[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [expandedCommentSymbol, setExpandedCommentSymbol] = useState<string | null>(null);
  const [movingSymbol, setMovingSymbol] = useState<string | null>(null);
  const [watchlistCommentExpanded, setWatchlistCommentExpanded] = useState(false);
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
  const allWatchlistSymbols = useMemo(() => {
    const seen = new Set<string>();
    const syms: string[] = [];
    for (const watchlist of watchlists) {
      for (const item of watchlist.items) {
        if (seen.has(item.sym)) continue;
        seen.add(item.sym);
        syms.push(item.sym);
      }
    }
    return syms;
  }, [watchlists]);
  const { quotes, refetch, refetchAll, refetching } = useWatchlistQuotes(
    allSymbols,
    store,
    liveEnabled,
    allWatchlistSymbols,
  );

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

  const handleRenameTag = useCallback(
    (tag: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      renameTag(tag, trimmed);
      setActiveTags((prev) => {
        const renamed = prev.map((activeTag) =>
          activeTag.toLowerCase() === tag.toLowerCase() ? trimmed : activeTag,
        );
        return renamed.filter(
          (activeTag, index) =>
            renamed.findIndex(
              (candidate) => candidate.toLowerCase() === activeTag.toLowerCase(),
            ) === index,
        );
      });
    },
    [renameTag],
  );

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
    async (id: string) => {
      const watchlist = watchlists.find((w) => w.id === id);
      const name = watchlist?.name ?? 'this watchlist';
      if (
        !(await confirm({
          title: 'Delete watchlist',
          message: `Delete "${name}" and all its symbols?`,
          confirmLabel: 'Delete',
          destructive: true,
        }))
      ) {
        return;
      }
      deleteWatchlist(id);
    },
    [watchlists, deleteWatchlist, confirm],
  );

  const handleRemoveItem = useCallback(
    async (sym: string) => {
      if (
        !(await confirm({
          title: 'Remove symbol',
          message: `Remove ${sym} from the watchlist?`,
          confirmLabel: 'Remove',
          destructive: true,
        }))
      ) {
        return;
      }
      removeItem(sym);
    },
    [removeItem, confirm],
  );

  const handleRenameActive = useCallback(
    (name: string) => {
      if (activeWatchlist) renameWatchlist(activeWatchlist.id, name);
    },
    [activeWatchlist, renameWatchlist],
  );

  const expandedCommentItem = activeWatchlist?.items.find(
    (item) => item.sym === expandedCommentSymbol,
  );
  const movingItem = activeWatchlist?.items.find((item) => item.sym === movingSymbol);
  const handleMoveItem = useCallback(
    (targetWatchlistId: string) => {
      if (!movingSymbol) return;
      moveItem(movingSymbol, targetWatchlistId);
      setMovingSymbol(null);
    },
    [moveItem, movingSymbol],
  );
  const handleCloseMoveDialog = useCallback(() => setMovingSymbol(null), []);
  const handleSaveExpandedComment = useCallback(
    (comment: string) => {
      if (expandedCommentSymbol) setItemComment(expandedCommentSymbol, comment);
    },
    [expandedCommentSymbol, setItemComment],
  );
  const handleCloseExpandedComment = useCallback(() => setExpandedCommentSymbol(null), []);
  const handleSaveWatchlistComment = useCallback(
    (comment: string) => {
      if (activeWatchlist) setWatchlistComment(activeWatchlist.id, comment);
    },
    [activeWatchlist, setWatchlistComment],
  );
  const handleCloseWatchlistComment = useCallback(() => setWatchlistCommentExpanded(false), []);

  useEffect(() => {
    setWatchlistCommentExpanded(false);
    setMovingSymbol(null);
  }, [activeId]);

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

          <div className="watchlist-note">
            <label className="fl" htmlFor={`watchlist-note-${activeWatchlist.id}`}>
              Watchlist comment
            </label>
            <WatchlistNoteEditor
              id={`watchlist-note-${activeWatchlist.id}`}
              comment={activeWatchlist.comment ?? ''}
              onChange={(value) => setWatchlistComment(activeWatchlist.id, value)}
              onExpand={() => setWatchlistCommentExpanded(true)}
            />
          </div>

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
              onRename={handleRenameTag}
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
                        onRequestMove={setMovingSymbol}
                        onUpdateTags={setItemTags}
                        onUpdateComment={setItemComment}
                        onExpandComment={setExpandedCommentSymbol}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="watchlist-footer">
            <div className="watchlist-footer-actions">
              <button
                type="button"
                className="btn watchlist-refresh-btn"
                onClick={() => void refetch()}
                disabled={refetching || allSymbols.length === 0}
                title="Refresh quotes for this watchlist (max 2 requests/sec)"
              >
                <Icon name="refresh" size="sm" />
                {refetching ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="btn watchlist-refresh-btn"
                onClick={() => void refetchAll()}
                disabled={refetching || allWatchlistSymbols.length === 0}
                title="Refresh quotes for all watchlists (max 2 requests/sec)"
              >
                <Icon name="refresh" size="sm" />
                {refetching ? 'Refreshing…' : 'Refresh All'}
              </button>
              {watchlists.length > 1 && (
                <button
                  type="button"
                  className="btn watchlist-delete-btn"
                  {...deleteWatchlistPenClick}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>
      {movingItem && (
        <WatchlistMoveDialog
          item={movingItem}
          watchlists={watchlists}
          sourceWatchlistId={activeId}
          onMove={handleMoveItem}
          onClose={handleCloseMoveDialog}
        />
      )}
      {expandedCommentItem && (
        <CommentEditorDialog
          title={`${expandedCommentItem.sym} comment`}
          comment={expandedCommentItem.comment ?? ''}
          placeholder={`Add notes for ${expandedCommentItem.sym}…`}
          unsavedMessage={`Save your comment for ${expandedCommentItem.sym} before closing?`}
          onSave={handleSaveExpandedComment}
          onClose={handleCloseExpandedComment}
        />
      )}
      {watchlistCommentExpanded && activeWatchlist && (
        <CommentEditorDialog
          title="Watchlist comment"
          comment={activeWatchlist.comment ?? ''}
          placeholder="Add notes for this watchlist…"
          unsavedMessage="Save your watchlist comment before closing?"
          onSave={handleSaveWatchlistComment}
          onClose={handleCloseWatchlistComment}
        />
      )}
    </Section>
  );
}

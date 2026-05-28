'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { gsap } from 'gsap';
import type { View, Theme } from '@/lib/data';
import { useFilters } from '@/context/FilterContext';
import type { PaletteData, ParsedIntent, HistoryItem } from './types';
import { fetchPaletteData, buildAliasMap } from './PaletteData';
import { parseNaturalQuery, buildSmartLabel } from './NLParser';
import { buildCommands } from './CommandBuilder';
import CommandItem from './CommandItem';
import SmartResult from './SmartResult';
import EmptyState from './EmptyState';

/* ── History helpers ────────────────────────────────────────── */

const HISTORY_KEY = 'chronicle-palette-history';
const STALE_MS    = 5 * 60 * 1000;

function addToHistory(query: string, label: string) {
  try {
    const raw  = localStorage.getItem(HISTORY_KEY);
    const list: HistoryItem[] = raw ? JSON.parse(raw) : [];
    const next = [
      { query, label, timestamp: Date.now() },
      ...list.filter(h => h.query !== query),
    ].slice(0, 10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch { /* noop */ }
}

function getHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10)  return 'just now';
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ── Props ──────────────────────────────────────────────────── */

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  view: View;
  navigate: (v: View) => void;
  onNewEntry: () => void;
  onImport: () => void;
  onToggleSidebar: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onShowShortcuts: () => void;
  onOpenActivity: () => void;
}

/* ── Component ──────────────────────────────────────────────── */

export default function CommandPalette({
  open, onClose, view, navigate,
  onNewEntry, onImport, onToggleSidebar,
  theme, onSetTheme, onShowShortcuts, onOpenActivity,
}: CommandPaletteProps) {
  const { setPreset, setCustomRange, setClient, setBillingType, resetFilters } = useFilters();

  const scrimRef  = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const [query,       setQuery]       = useState('');
  const [data,        setData]        = useState<PaletteData | null>(null);
  const [dataError,   setDataError]   = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [history,     setHistory]     = useState<HistoryItem[]>([]);
  const lastFetchedAt = useRef(0);

  /* ── Data fetch on open ─────────────────────────────────── */
  useEffect(() => {
    if (!open) return;

    setQuery('');
    setHistory(getHistory());

    const isStale = Date.now() - lastFetchedAt.current > STALE_MS;
    if (!data || isStale) {
      setDataLoading(true);
      setDataError(false);
      fetchPaletteData()
        .then(d => {
          setData(d);
          lastFetchedAt.current = Date.now();
        })
        .catch(() => setDataError(true))
        .finally(() => setDataLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ── GSAP enter / exit ──────────────────────────────────── */
  useEffect(() => {
    const scrim  = scrimRef.current;
    const dialog = dialogRef.current;
    if (!scrim || !dialog) return;

    if (open) {
      gsap.set(scrim, { display: 'flex' });
      gsap.fromTo(scrim,  { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power2.out' });
      gsap.fromTo(dialog,
        { y: -14, opacity: 0, scale: 0.96 },
        { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: 'power3.out' },
      );
    } else {
      gsap.to(dialog, { y: -10, opacity: 0, scale: 0.97, duration: 0.15, ease: 'power2.in' });
      gsap.to(scrim, {
        opacity: 0, duration: 0.18, ease: 'power2.in',
        onComplete: () => gsap.set(scrim, { display: 'none' }),
      });
    }
  }, [open]);

  /* ── Auto-focus input ───────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  /* ── Escape (capture phase, wins over AppShell's handler) ── */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  /* ── Alias maps (memoised) ──────────────────────────────── */
  const aliasMaps = useMemo(() => (data ? buildAliasMap(data) : null), [data]);

  /* ── NL parse ───────────────────────────────────────────── */
  const intent = useMemo<ParsedIntent | null>(() => {
    if (!query.trim() || query.trim().length < 4 || !data || !aliasMaps) return null;
    return parseNaturalQuery(query, data, aliasMaps);
  }, [query, data, aliasMaps]);

  const showSmartResult = intent !== null && intent.confidence >= 0.3;

  /* ── Command groups ─────────────────────────────────────── */
  const commandGroups = buildCommands({
    view, theme, data,
    navigate, setPreset, setClient, setBillingType, resetFilters,
    onNewEntry, onImport, onToggleSidebar,
    onSetTheme, onShowShortcuts, onOpenActivity,
  });

  /* ── Smart result execute ───────────────────────────────── */
  const handleSmartSelect = useCallback(() => {
    if (!intent) return;

    const label = buildSmartLabel(intent);
    if (query.trim()) addToHistory(query.trim(), label);

    // Apply filters available in FilterContext
    if (intent.datePreset && intent.datePreset !== 'custom') {
      setPreset(intent.datePreset);
    } else if (intent.customDate) {
      setCustomRange(intent.customDate.start, intent.customDate.end);
    }
    if (intent.project) setClient(intent.project.clientId);
    else if (intent.client) setClient(intent.client.id);
    if (intent.billingType) setBillingType(intent.billingType);

    // Navigate
    switch (intent.action) {
      case 'export':    navigate('export');    break;
      case 'stats':     navigate('dashboard'); break;
      case 'activity':  onOpenActivity();       break;
      case 'log':       onNewEntry();           break;
      case 'easter_egg': /* stay put */         break;
      default:          navigate('timesheet'); break;
    }

    onClose();
  }, [intent, query, setPreset, setCustomRange, setClient, setBillingType,
      navigate, onOpenActivity, onNewEntry, onClose]);

  /* ── Command item execute ───────────────────────────────── */
  const handleCmdSelect = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  /* ── History item select — re-run the query ─────────────── */
  const handleHistorySelect = useCallback((item: HistoryItem) => {
    setQuery(item.query);
  }, []);

  /* ── cmdk filter — show everything when NL result active ── */
  const cmdFilter = useMemo<((v: string, s: string, k?: string[]) => number) | undefined>(
    () => showSmartResult ? () => 1 : undefined,
    [showSmartResult],
  );

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div
      ref={scrimRef}
      className="cp-scrim"
      style={{ display: 'none' }}
      onMouseDown={e => { if (e.target === scrimRef.current) onClose(); }}
    >
      <div ref={dialogRef} className="cp-dialog">
        <Command label="Command palette" loop filter={cmdFilter}>

          {/* ── Input ── */}
          <div className="cp-input-wrap">
            <svg className="cp-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <Command.Input
              ref={inputRef}
              className="cp-input"
              placeholder="Search commands or type naturally…"
              value={query}
              onValueChange={setQuery}
            />
            {query && (
              <button
                className="cp-clear-btn"
                onClick={() => setQuery('')}
                aria-label="Clear"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {/* ── Results list ── */}
          <Command.List className="cp-list">
            <Command.Empty>
              <EmptyState
                query={query}
                onCreateEntry={query ? () => { onNewEntry(); onClose(); } : undefined}
                onSearchEntries={query ? () => { navigate('timesheet'); onClose(); } : undefined}
              />
            </Command.Empty>

            {/* Loading skeletons — while first fetch in progress */}
            {dataLoading && !data && (
              <div className="cp-loading" aria-hidden>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="skeleton cp-item-skeleton" />
                ))}
              </div>
            )}

            {/* Error banner */}
            {dataError && (
              <div className="cp-notice">
                Project and member search unavailable · Navigation still works
              </div>
            )}

            {/* ✦ Smart result */}
            {showSmartResult && intent && (
              <SmartResult intent={intent} onSelect={handleSmartSelect} />
            )}

            {/* History — only when query is empty */}
            {!query && history.length > 0 && (
              <Command.Group heading="Recent queries" className="cp-group">
                {history.slice(0, 5).map(h => (
                  <Command.Item
                    key={h.query}
                    value={`__hist__${h.query}`}
                    onSelect={() => handleHistorySelect(h)}
                    className="cp-item"
                  >
                    <span className="cp-item-icon">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="cp-item-body">
                      <span className="cp-item-label">{h.label}</span>
                      <span className="cp-item-hint">{h.query} · {relTime(h.timestamp)}</span>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Regular command groups */}
            {commandGroups.map(group => (
              <Command.Group key={group.id} heading={group.heading} className="cp-group">
                {group.commands.map(cmd => (
                  <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    onSelect={() => handleCmdSelect(cmd.action)}
                  />
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* ── Footer ── */}
          <div className="cp-footer">
            <span className="cp-footer-hint"><kbd>↑↓</kbd> navigate</span>
            <span className="cp-footer-hint"><kbd>↵</kbd> select</span>
            <span className="cp-footer-hint"><kbd>⎋</kbd> close</span>
            <span className="cp-footer-divider" />
            <span className="cp-footer-hint" style={{ marginLeft: 'auto' }}>
              <kbd>⌘K</kbd> toggle
            </span>
          </div>

        </Command>
      </div>
    </div>
  );
}

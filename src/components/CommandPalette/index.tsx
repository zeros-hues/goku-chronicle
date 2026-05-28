'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { gsap } from 'gsap';
import type { View, Client, Member, Theme } from '@/lib/data';
import { useFilters } from '@/context/FilterContext';
import { buildCommands } from './commands';
import CommandItem from './CommandItem';
import EmptyState from './EmptyState';

const RECENT_KEY = 'chronicle-cmd-recent';
const RECENT_MAX = 8;

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; }
}

function pushRecent(id: string) {
  const list = [id, ...getRecent().filter(r => r !== id)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  view: View;
  clients: Client[];
  members: Member[];
  navigate: (v: View) => void;
  onNewEntry: () => void;
  onImport: () => void;
  onToggleSidebar: () => void;
  theme: Theme;
  onSetTheme: (t: Theme) => void;
  onShowShortcuts: () => void;
}

export default function CommandPalette({
  open, onClose, view, clients, members,
  navigate, onNewEntry, onImport, onToggleSidebar,
  theme, onSetTheme, onShowShortcuts,
}: CommandPaletteProps) {
  const { setPreset, setClient, setBillingType, resetFilters } = useFilters();
  const scrimRef  = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery]   = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  /* ── Refresh recent list + clear query on each open ──── */
  useEffect(() => {
    if (open) {
      setQuery('');
      setRecent(getRecent());
    }
  }, [open]);

  /* ── GSAP enter / exit ──────────────────────────────── */
  useEffect(() => {
    const scrim  = scrimRef.current;
    const dialog = dialogRef.current;
    if (!scrim || !dialog) return;

    if (open) {
      gsap.set(scrim, { display: 'flex' });
      gsap.fromTo(scrim,   { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power2.out' });
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

  /* ── Auto-focus input on open ──────────────────────── */
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      // slight delay to let animation start before focus
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* ── Keyboard: Escape ──────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  /* ── Build commands ────────────────────────────────── */
  const handleSelect = useCallback((id: string, action: () => void) => {
    pushRecent(id);
    action();
    onClose();
  }, [onClose]);

  const allGroups = buildCommands({
    view, clients, members, navigate,
    setPreset, setClient, setBillingType,
    onNewEntry, onImport, onToggleSidebar,
    theme, onSetTheme, onShowShortcuts,
    onResetFilters: resetFilters,
  });

  const allCommandsFlat = allGroups.flatMap(g => g.commands);

  const recentCommands = recent
    .map(id => allCommandsFlat.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null)
    .slice(0, 5);

  return (
    <div
      ref={scrimRef}
      className="cp-scrim"
      style={{ display: 'none' }}
      onMouseDown={e => { if (e.target === scrimRef.current) onClose(); }}
    >
      <div ref={dialogRef} className="cp-dialog">
        <Command label="Command palette" loop>
          <div className="cp-input-wrap">
            <svg className="cp-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <Command.Input
              ref={inputRef}
              className="cp-input"
              placeholder="Search commands…"
              value={query}
              onValueChange={setQuery}
            />
            {query && (
              <button className="cp-clear-btn" onClick={() => setQuery('')} aria-label="Clear search">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <Command.List className="cp-list">
            <Command.Empty>
              <EmptyState query={query} />
            </Command.Empty>

            {/* Recent — only when query is empty */}
            {!query && recentCommands.length > 0 && (
              <Command.Group heading="Recent" className="cp-group">
                {recentCommands.map(cmd => (
                  <CommandItem
                    key={`recent-${cmd.id}`}
                    cmd={cmd}
                    onSelect={() => handleSelect(cmd.id, cmd.action)}
                  />
                ))}
              </Command.Group>
            )}

            {allGroups.map(group => (
              <Command.Group key={group.id} heading={group.heading} className="cp-group">
                {group.commands.map(cmd => (
                  <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    onSelect={() => handleSelect(cmd.id, cmd.action)}
                  />
                ))}
              </Command.Group>
            ))}
          </Command.List>

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

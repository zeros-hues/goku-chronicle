'use client';

import { useEffect } from 'react';
import { IconX } from './Icons';

const SHORTCUTS = [
  { key: '⌘K',  label: 'Command palette',              context: 'Anywhere'  },
  { key: 'N',   label: 'New entry',                    context: 'Timesheet' },
  { key: 'E',   label: 'Edit selected entry',          context: 'Timesheet' },
  { key: '/',   label: 'Focus search',                 context: 'Timesheet' },
  { key: '[',   label: 'Toggle sidebar',               context: 'Anywhere'  },
  { key: '?',   label: 'Show this dialog',             context: 'Anywhere'  },
  { key: 'Esc', label: 'Close drawer / dialog',        context: 'Anywhere'  },
];

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" style={{ zIndex: 600 }} onClick={onClose}>
      <div className="shortcuts-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2>Keyboard shortcuts</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div className="shortcuts-list">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="shortcut-row">
              <span className="shortcut-label">{s.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-ghost)', letterSpacing: '0.06em' }}>
                  {s.context}
                </span>
                <kbd className="kbd">{s.key}</kbd>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

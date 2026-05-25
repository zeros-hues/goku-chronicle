'use client';

import { useState } from 'react';
import type { Entry } from '@/lib/data';
import { MEMBERS, PROJECT_BY_ID, entryHours, pad, dowShort } from '@/lib/data';
import ProjectPill from './ProjectPill';
import ConfirmDialog from './ConfirmDialog';
import { IconUndo, IconTrash } from './Icons';

const ACTIVE_MEMBERS = MEMBERS.filter(m => m.active);

function fmt(h: number) { return h % 1 === 0 ? String(h) : h.toFixed(1); }

interface TrashPageProps {
  entries:   Entry[];
  onRestore: (ids: Set<number>) => void;
  onDelete:  (ids: Set<number>) => void;
  showToast: (text: string, action?: { label: string; cb: () => void }) => void;
}

function EmptyTrash() {
  return (
    <div className="empty" style={{ padding: '80px 24px' }}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="empty-illustration" style={{ margin: '0 auto 20px', display: 'block' }}>
        <rect x="16" y="22" width="40" height="38" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 22h52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M26 22v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="28" y1="34" x2="28" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3"/>
        <line x1="36" y1="34" x2="36" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3"/>
        <line x1="44" y1="34" x2="44" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 3"/>
        {/* small sparkle */}
        <path d="M54 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="currentColor" opacity="0.5"/>
      </svg>
      <h3>Trash is empty</h3>
      <p>Entries you delete from the timesheet will appear here. You can restore them or delete permanently.</p>
    </div>
  );
}

export default function TrashPage({ entries, onRestore, onDelete, showToast }: TrashPageProps) {
  const trashed = entries.filter(e => e.trashed);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [confirm, setConfirm]       = useState<null | 'single' | 'bulk' | 'all'>(null);
  const [confirmIds, setConfirmIds] = useState<Set<number>>(new Set());

  const selectionMode = selected.size > 0;

  function toggleSelect(id: number) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function allIds() { return new Set(trashed.map(e => e.id)); }

  function requestDelete(ids: Set<number>, mode: 'single' | 'bulk' | 'all') {
    setConfirmIds(ids);
    setConfirm(mode);
  }

  function confirmDelete() {
    onDelete(confirmIds);
    const count = confirmIds.size;
    showToast(`${count} ${count === 1 ? 'entry' : 'entries'} permanently deleted`);
    if (confirm === 'bulk') setSelected(new Set());
    setConfirm(null);
    setConfirmIds(new Set());
  }

  function handleRestore(ids: Set<number>) {
    onRestore(ids);
    const count = ids.size;
    showToast(count === 1 ? 'Entry restored' : `${count} entries restored`, {
      label: 'Undo',
      cb: () => { onDelete(ids); },
    });
    if (selected.size > 0) setSelected(new Set());
  }

  if (trashed.length === 0) {
    return (
      <div className="trash">
        <EmptyTrash />
      </div>
    );
  }

  const confirmMsg = confirm === 'all'
    ? `This will permanently delete all ${trashed.length} entries. This cannot be undone.`
    : confirm === 'bulk'
    ? `This will permanently delete ${confirmIds.size} selected ${confirmIds.size === 1 ? 'entry' : 'entries'}. This cannot be undone.`
    : 'This entry will be permanently deleted and cannot be recovered.';

  return (
    <div className="trash">

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-fade)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {trashed.length} {trashed.length === 1 ? 'entry' : 'entries'} in trash
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => { handleRestore(allIds()); }}>
            <IconUndo size={13} /> Restore all
          </button>
          <button
            className="btn btn-sm"
            style={{ color: 'var(--accent)', borderColor: 'color-mix(in oklch, var(--accent) 40%, var(--paper-edge))' }}
            onClick={() => requestDelete(allIds(), 'all')}
          >
            <IconTrash size={13} /> Empty trash
          </button>
        </div>
      </div>

      {/* Table */}
      <table className={`ts-table${selectionMode ? ' selection-mode' : ''}`}>
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th style={{ width: 70 }}>Date</th>
            <th style={{ width: 50 }}>Day</th>
            <th style={{ width: 200 }}>Project</th>
            <th>Task</th>
            {ACTIVE_MEMBERS.map(m => (
              <th key={m.id} className="num" style={{ width: 44 }}>{m.init}</th>
            ))}
            <th className="num" style={{ width: 60 }}>Total</th>
            <th style={{ width: 88 }} />
          </tr>
        </thead>
        <tbody>
          {trashed.map(entry => {
            const proj  = PROJECT_BY_ID[entry.projectId];
            const total = entryHours(entry);
            const d     = new Date(entry.date + 'T00:00:00');
            return (
              <tr key={entry.id} className="entry" style={{ opacity: 0.75 }}>
                <td style={{ paddingRight: 0 }}>
                  <span
                    className={'row-checkbox' + (selected.has(entry.id) ? ' checked' : '')}
                    onClick={() => toggleSelect(entry.id)}
                    style={{ opacity: 1, pointerEvents: 'auto' }}
                  />
                </td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
                  {pad(d.getDate())}/{pad(d.getMonth() + 1)}
                </td>
                <td style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-fade)', fontSize: 13 }}>
                  {dowShort(d)}
                </td>
                <td>
                  {proj && <ProjectPill project={proj} clientName={proj.clientId !== 'goku' ? proj.clientName : undefined} />}
                </td>
                <td className="task-cell">
                  {entry.type === 'meeting' && <span className="meet">Meeting</span>}
                  {entry.task}
                </td>
                {ACTIVE_MEMBERS.map(m => {
                  const h = entry.type === 'task' ? (entry.hours[m.id] ?? 0) : 0;
                  return (
                    <td key={m.id} className={`hrs${h === 0 ? ' zero' : ''}`}>
                      {h > 0
                        ? <><span className="v">{fmt(h)}</span><span className="u">h</span></>
                        : <span className="empty">—</span>
                      }
                    </td>
                  );
                })}
                <td className="hrs total">
                  <span className="v">{fmt(total)}</span>
                  <span className="u">h</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Restore"
                      onClick={e => { e.stopPropagation(); handleRestore(new Set([entry.id])); }}>
                      <IconUndo size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm btn-icon" title="Delete permanently"
                      style={{ color: 'var(--accent)' }}
                      onClick={e => { e.stopPropagation(); requestDelete(new Set([entry.id]), 'single'); }}>
                      <IconTrash size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Selection bar */}
      {selectionMode && (
        <div className="selection-bar">
          <span className="count">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())}>Deselect</button>
          <button onClick={() => { handleRestore(selected); setSelected(new Set()); }}>
            <IconUndo size={13} /> Restore
          </button>
          <button className="danger" onClick={() => requestDelete(selected, 'bulk')}>
            <IconTrash size={13} /> Delete permanently
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          title="Delete permanently?"
          body={confirmMsg}
          confirmLabel="Delete permanently"
          danger
          onConfirm={confirmDelete}
          onCancel={() => { setConfirm(null); setConfirmIds(new Set()); }}
        />
      )}
    </div>
  );
}

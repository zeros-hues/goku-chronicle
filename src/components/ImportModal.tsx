'use client';

import { useState, useRef } from 'react';
import { PROJECT_BY_ID, entryHours } from '@/lib/data';
import type { Entry } from '@/lib/data';
import ProjectPill from './ProjectPill';
import { IconX, IconCheck, IconWarn } from './Icons';

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'done' | 'error';
type EntryStatus = 'new' | 'duplicate';

interface ImportEntry { entry: Entry; status: EntryStatus; }

function parseJson(text: string): Entry[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data as Entry[];
  if (Array.isArray(data.entries)) return data.entries as Entry[];
  throw new Error('Unrecognized Chronicle backup format');
}

function isDuplicate(e: Entry, existing: Entry[]): boolean {
  return existing.some(x =>
    !x.trashed && x.date === e.date && x.projectId === e.projectId && x.task === e.task
  );
}

interface ImportModalProps {
  existingEntries: Entry[];
  onImport: (entries: Entry[]) => void;
  onClose: () => void;
}

export default function ImportModal({ existingEntries, onImport, onClose }: ImportModalProps) {
  const [status, setStatus]   = useState<ImportStatus>('idle');
  const [isDragOver, setDrag] = useState(false);
  const [parsed, setParsed]   = useState<ImportEntry[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [errorMsg, setError]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setStatus('parsing');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const entries = parseJson(ev.target!.result as string);
        if (!entries.length) throw new Error('No entries found in file');
        const items: ImportEntry[] = entries.map(e => ({
          entry: e,
          status: isDuplicate(e, existingEntries) ? 'duplicate' : 'new',
        }));
        const sel = new Set(
          items.map((_, i) => i).filter(i => items[i].status === 'new')
        );
        setParsed(items);
        setSelected(sel);
        setStatus('preview');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not parse file.');
        setStatus('error');
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function toggleRow(i: number) {
    setSelected(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  function handleConfirm() {
    const toImport = Array.from(selected).map(i => ({
      ...parsed[i].entry,
      id: Date.now() + i,
      createdAt: Date.now(),
      trashed: false,
    } as Entry));
    onImport(toImport);
    setStatus('done');
  }

  const newCount = parsed.filter(p => p.status === 'new').length;
  const dupCount = parsed.filter(p => p.status === 'duplicate').length;
  const selCount = selected.size;

  return (
    <div className="modal-scrim" style={{ zIndex: 550 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-h">
          <h2>Import entries</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><IconX size={16} /></button>
        </div>

        <div className="modal-body">
          {(status === 'idle' || status === 'error') && (
            <>
              <div
                className={'dropzone' + (isDragOver ? ' over' : '')}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={handleDrop}
              >
                {/* Illustrated SVG */}
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ margin: '0 auto', display: 'block', marginBottom: 12 }}>
                  <rect x="10" y="6" width="28" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5"/>
                  <rect x="18" y="2" width="28" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3"/>
                  <path d="M22 24l8 8 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                  <line x1="30" y1="18" x2="30" y2="32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
                  <line x1="22" y1="35" x2="38" y2="35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                </svg>
                <h3>Drop your Chronicle backup here</h3>
                <p>or click to choose a file</p>
                <div className="formats">Accepts · .json (Chronicle backup)</div>
              </div>
              <input
                ref={fileRef} type="file" accept=".json"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
              />
              {status === 'error' && (
                <div className="import-error">
                  <IconWarn size={14} />
                  {errorMsg}
                </div>
              )}
            </>
          )}

          {status === 'parsing' && (
            <div className="import-loading">Parsing file…</div>
          )}

          {status === 'done' && (
            <div className="import-done">
              <div className="import-done-ring"><IconCheck size={32} /></div>
              <p className="import-done-msg">{selCount} {selCount === 1 ? 'entry' : 'entries'} imported successfully.</p>
            </div>
          )}

          {status === 'preview' && (
            <>
              <div className="import-summary">
                <span className="status-tag new">{newCount} new</span>
                {dupCount > 0 && <span className="status-tag dup">{dupCount} duplicate</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-fade)', fontFamily: 'var(--font-mono)' }}>
                  {selCount} selected
                </span>
              </div>

              {parsed.length === 0 ? (
                <div className="empty" style={{ padding: 40 }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="empty-illustration" style={{ margin: '0 auto 16px', display: 'block' }}>
                    <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <line x1="16" y1="16" x2="32" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="32" y1="16" x2="16" y2="32" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <h3>No entries found in file</h3>
                  <p>Make sure the file is a valid Chronicle JSON backup.</p>
                </div>
              ) : (
                <table className="ts-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th style={{ width: 90 }}>Date</th>
                      <th style={{ width: 180 }}>Project</th>
                      <th>Task</th>
                      <th className="num" style={{ width: 60 }}>Hours</th>
                      <th style={{ width: 80 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((item, i) => {
                      const proj = PROJECT_BY_ID[item.entry.projectId];
                      const isSel = selected.has(i);
                      
                      // Safely extract hours without using 'any'
                      const rawData = item.entry as unknown as {
                        hours?: Array<{ hours: string | number }> | string | number;
                        meetingDuration?: string | number;
                      };

                      const rawHours = rawData.hours;
                      const safeHrs = Array.isArray(rawHours) && rawHours.length > 0
                        ? rawHours.reduce((sum: number, h: { hours: string | number }) => sum + (Number(h.hours) || 0), 0)
                        : Number(entryHours(item.entry)) || Number(rawData.meetingDuration) || 0;

                      return (
                        <tr key={i} className="entry" onClick={() => toggleRow(i)}
                          style={{ opacity: item.status === 'duplicate' ? 0.55 : 1 }}>
                          <td>
                            <div className={`row-checkbox${isSel ? ' checked' : ''}`}
                              style={{ opacity: 1, pointerEvents: 'auto' }} />
                          </td>
                          <td className="mono" style={{ fontSize: 12, color: 'var(--ink-fade)' }}>
                            {item.entry.date}
                          </td>
                          <td>
                            {proj
                              ? <ProjectPill project={proj} clientName={proj.clientId !== 'goku' ? proj.clientName : undefined} />
                              : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-ghost)' }}>{item.entry.projectId}</span>
                            }
                          </td>
                          <td className="task-cell" style={{ fontSize: 12.5 }}>
                            {item.entry.type === 'meeting' && <span className="meet">Meeting</span>}
                            {item.entry.task}
                          </td>
                          <td className="hrs">
                            <span className="v">{safeHrs % 1 === 0 ? safeHrs : safeHrs.toFixed(1)}</span>
                            <span className="u">h</span>
                          </td>
                          <td>
                            <span className={`status-tag ${item.status}`}>
                              {item.status === 'new' ? 'New' : 'Duplicate'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {status === 'preview' && (
            <>
              <button className="btn btn-ghost" onClick={() => { setStatus('idle'); setParsed([]); setSelected(new Set()); }}>
                Back
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={selCount === 0}
                style={{ opacity: selCount === 0 ? 0.45 : 1 }}>
                <IconCheck size={14} />
                Import {selCount} {selCount === 1 ? 'entry' : 'entries'}
              </button>
            </>
          )}
          {(status === 'idle' || status === 'error') && (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          )}
          {status === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>
              <IconCheck size={14} /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
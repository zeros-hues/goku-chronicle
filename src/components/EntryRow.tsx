'use client';

import { useState } from 'react';
import type { Entry, Member, Project } from '@/lib/data';
import { entryHours } from '@/lib/data';
import ProjectPill from './ProjectPill';
import { IconMeeting } from './Icons';

function fmt(h: number) {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

type ProjectWithMeta = Project & { clientId: string; clientName: string };

interface EntryRowProps {
  entry: Entry;
  members: Member[];
  projectById: Record<string, ProjectWithMeta>;
  selected: boolean;
  onSelect: (id: number) => void;
  highlight?: boolean;
}

function HrsCell({ value }: { value: number }) {
  if (value === 0) return <td className="hrs zero"><span className="v">—</span></td>;
  return (
    <td className="hrs">
      <span className="v">{fmt(value)}</span>
      <span className="u">h</span>
    </td>
  );
}

function ExpandedDetail({ entry, members, projectById }: { entry: Entry; members: Member[]; projectById: Record<string, ProjectWithMeta> }) {
  const proj = projectById[entry.projectId];
  const activeMembers = members.filter(m => (entry.hours[m.id] ?? 0) > 0);
  const total = entryHours(entry);

  return (
    <tr className="expanded-detail">
      <td colSpan={members.length + 3}>
        <div className="expanded-detail-content">
          <p className="description">{entry.task}</p>
          <div className="chip-row">
            {entry.type === 'meeting' ? (
              <>
                {activeMembers.length === 0 && (
                  <span className="member-chip">
                    <span className="av" style={{ background: 'var(--ink-fade)', width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--paper)', fontSize: 10 }}>
                      <IconMeeting size={10} />
                    </span>
                    {entry.meetingPeople} people · {entry.meetingDuration}h each
                  </span>
                )}
              </>
            ) : (
              activeMembers.map(m => (
                <span key={m.id} className="member-chip">
                  <span className="av" style={{ background: m.color, width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'var(--paper)', fontFamily: 'var(--font-serif)', fontSize: 10, fontWeight: 500 }}>
                    {m.init.slice(0, 1)}
                  </span>
                  {m.name}
                  <span className="v">{fmt(entry.hours[m.id])}h</span>
                </span>
              ))
            )}
          </div>
          <div className="detail-meta-row">
            <span><b>{entry.date}</b></span>
            <span>
              <span className={`billing-badge ${entry.billing}`}>
                {entry.billing}
              </span>
            </span>
            <span><b>{proj?.clientName}</b> · {proj?.name}</span>
            <span>Total <b>{fmt(total)}h</b></span>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function EntryRow({ entry, members, projectById, selected, onSelect, highlight }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const proj = projectById[entry.projectId];
  const total = entryHours(entry);

  const rowClass = [
    'entry',
    expanded ? 'expanded' : '',
    highlight  ? 'row-highlight' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <tr className={rowClass} onClick={() => setExpanded(e => !e)}>
        {/* Checkbox */}
        <td style={{ width: 36, paddingRight: 0 }}>
          <span
            className={'row-checkbox' + (selected ? ' checked' : '')}
            onClick={e => { e.stopPropagation(); onSelect(entry.id); }}
          />
        </td>

        {/* Project */}
        <td style={{ width: 180 }}>
          {proj && <ProjectPill project={proj} clientName={proj.clientName} />}
        </td>

        {/* Task */}
        <td className="task-cell">
          {entry.type === 'meeting' && <span className="meet">Meet</span>}
          {entry.task}
        </td>

        {/* Per-member hours */}
        {members.map(m => (
          <HrsCell key={m.id} value={entry.type === 'meeting' ? 0 : (entry.hours[m.id] ?? 0)} />
        ))}

        {/* Total */}
        <td className="hrs total">
          <span className="v">{fmt(total)}</span>
          <span className="u">h</span>
        </td>
      </tr>

      {expanded && <ExpandedDetail entry={entry} members={members} projectById={projectById} />}
    </>
  );
}

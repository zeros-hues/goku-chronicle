'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { entryHours, isWeekend, fmtDate, monShort, dowShort, pad } from '@/lib/data';
import type { Entry, Member, Project } from '@/lib/data';
import { IconPrint } from './Icons';

type RangeId = 'today' | 'this-week' | 'this-month' | 'last-month' | 'this-year';

const RANGES: { id: RangeId; label: string }[] = [
  { id: 'today',      label: 'Today'      },
  { id: 'this-week',  label: 'This week'  },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-year',  label: 'This year'  },
];

type ProjectWithMeta = Project & { clientId: string; clientName: string };

function useCountUp(target: number, dur = 1100) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setN(target * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return n;
}

function Metric({ label, value, suffix = 'h', delta, accent }: {
  label: string; value: number; suffix?: string; delta?: string; accent?: boolean;
}) {
  const n = useCountUp(value);
  return (
    <div className={'metric' + (accent ? ' accent' : '')}>
      <div className="l">{label}</div>
      <div className="n">
        {suffix === '' ? Math.round(n) : (Math.round(n * 10) / 10).toFixed(1)}
        {suffix && <span className="u">{suffix}</span>}
      </div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

function BarRow({ label, value, max, color }: {
  label: React.ReactNode; value: number; max: number; color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(pct), 60);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="row">
      <div className="lbl">{label}</div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: w + '%', background: color }} />
      </div>
      <div className="v">{value.toFixed(1)}h</div>
    </div>
  );
}

interface DashboardProps {
  entries: Entry[];
  members: Member[];
  projectById: Record<string, ProjectWithMeta>;
  holidays: Record<string, string>;
  hoursTarget: number;
}

export default function Dashboard({ entries, members, projectById, holidays, hoursTarget }: DashboardProps) {
  const today = useMemo(() => new Date(), []);
  const DAILY_TARGET = hoursTarget;
  const [range, setRange] = useState<RangeId>('this-month');
  const metricGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!metricGridRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.metric',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.06, clearProps: 'y,opacity' },
      );
    }, metricGridRef);
    return () => ctx.revert();
  }, []);

  const [rangeStart, rangeEnd] = useMemo(() => {
    const t = new Date(today);
    if (range === 'today') return [
      new Date(t.getFullYear(), t.getMonth(), t.getDate()),
      new Date(t.getFullYear(), t.getMonth(), t.getDate()),
    ];
    if (range === 'this-week') {
      const s = new Date(t); s.setDate(t.getDate() - t.getDay());
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return [s, e];
    }
    if (range === 'this-month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
    if (range === 'last-month') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    return [new Date(t.getFullYear(), 0, 1), new Date(t.getFullYear(), 11, 31)];
  }, [range, today]);

  const filtered = useMemo(() => entries.filter(e => {
    if (e.trashed) return false;
    const d = new Date(e.date + 'T00:00:00');
    return d >= rangeStart && d <= rangeEnd;
  }), [entries, rangeStart, rangeEnd]);

  const totalHours    = filtered.reduce((s, e) => s + entryHours(e), 0);
  const retainerHours = filtered.filter(e => e.billing === 'retainer').reduce((s, e) => s + entryHours(e), 0);
  const outHours      = filtered.filter(e => e.billing === 'out').reduce((s, e) => s + entryHours(e), 0);
  const internalHours = filtered.filter(e => e.billing === 'internal').reduce((s, e) => s + entryHours(e), 0);

  const activeMemberSet = new Set<string>();
  filtered.forEach(e => { if (e.type === 'task') Object.keys(e.hours).forEach(m => activeMemberSet.add(m)); });

  // Hours by project
  const byProject: Record<string, number> = {};
  filtered.forEach(e => { byProject[e.projectId] = (byProject[e.projectId] ?? 0) + entryHours(e); });
  const projectRows = Object.entries(byProject)
    .map(([pid, hrs]) => ({ project: projectById[pid], hours: hrs }))
    .filter(r => r.project)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);
  const maxProj = projectRows[0]?.hours || 1;

  // Hours by member
  const byMember: Record<string, number> = {};
  filtered.forEach(e => {
    if (e.type === 'task') Object.entries(e.hours).forEach(([mid, h]) => { byMember[mid] = (byMember[mid] ?? 0) + h; });
  });
  const memberRows = members.map(m => ({ member: m, hours: byMember[m.id] ?? 0 })).sort((a, b) => b.hours - a.hours);
  const maxMem = Math.max(1, ...memberRows.map(r => r.hours));

  // Daily stacked chart
  const dayMap: Record<string, { members: Record<string, number>; total: number }> = {};
  const cur = new Date(rangeStart);
  while (cur <= rangeEnd) {
    dayMap[fmtDate(cur)] = { members: {}, total: 0 };
    cur.setDate(cur.getDate() + 1);
  }
  filtered.forEach(e => {
    if (!dayMap[e.date]) dayMap[e.date] = { members: {}, total: 0 };
    if (e.type === 'task') {
      Object.entries(e.hours).forEach(([mid, h]) => {
        dayMap[e.date].members[mid] = (dayMap[e.date].members[mid] ?? 0) + h;
        dayMap[e.date].total += h;
      });
    } else {
      dayMap[e.date].members.__meet = (dayMap[e.date].members.__meet ?? 0) + entryHours(e);
      dayMap[e.date].total += entryHours(e);
    }
  });
  const dayEntries = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));

  // Trim future empty days so the chart doesn't show dead space to the right
  const chartDays = dayEntries.filter(([d]) => new Date(d + 'T00:00:00') <= today);
  const nChart = chartDays.length;
  const maxDay = Math.max(1, ...chartDays.map(([, v]) => v.total));

  // Adaptive column sizing: narrow fixed-width columns for long ranges (scroll if needed),
  // flex for short ranges (fills full card width)
  const colW   = nChart > 62 ? 5 : nChart > 31 ? 8 : undefined;
  const gapPx  = nChart > 62 ? 1 : nChart > 31 ? 2 : 3;

  // Goal + below-target
  const workingDays = dayEntries.filter(([d]) => {
    const dt = new Date(d + 'T00:00:00');
    return !isWeekend(dt) && !holidays[d] && dt <= today;
  });
  const studioAvg = workingDays.length > 0
    ? workingDays.reduce((s, [, v]) => s + v.total, 0) / workingDays.length / Math.max(1, members.length)
    : 0;
  const belowTarget = workingDays
    .filter(([, v]) => v.total / Math.max(1, members.length) < DAILY_TARGET * 0.8)
    .map(([d]) => d).slice(0, 8);

  // Overtime
  const overtime = members.map(m => {
    const days: { date: string; hours: number }[] = [];
    Object.entries(dayMap).forEach(([d, v]) => {
      const h = v.members[m.id] ?? 0;
      if (h > 9) days.push({ date: d, hours: h });
    });
    return { member: m, days };
  }).filter(r => r.days.length > 0);

  // Quick stats
  const busiestDay = dayEntries.reduce<[string, typeof dayMap[string]] | null>(
    (best, cur) => cur[1].total > (best?.[1].total ?? 0) ? cur : best, null
  );
  const noEntryDays = dayEntries.filter(([d, v]) => {
    const dt = new Date(d + 'T00:00:00');
    return !isWeekend(dt) && !holidays[d] && v.total === 0 && dt <= today;
  }).length;
  const avgDaily = workingDays.length > 0
    ? workingDays.reduce((s, [, v]) => s + v.total, 0) / workingDays.length
    : 0;

  if (totalHours === 0) {
    return (
      <div className="dash">
        <div className="dash-range no-print">
          {RANGES.map(r => (
            <button key={r.id} className={'dash-range-chip' + (range === r.id ? ' active' : '')} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="dash-empty">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" className="empty-illustration">
            <rect x="10" y="40" width="8" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <rect x="24" y="28" width="8" height="32" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <rect x="38" y="18" width="8" height="42" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <rect x="52" y="32" width="8" height="28" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.45"/>
            <line x1="8" y1="62" x2="64" y2="62" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M54 12l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="currentColor" opacity="0.4"/>
          </svg>
          <h3>No data for this period</h3>
          <p>Log some entries in the Timesheet to see your studio analytics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash">
      {/* Range + print */}
      <div className="dash-range no-print">
        {RANGES.map(r => (
          <button
            key={r.id}
            className={'dash-range-chip' + (range === r.id ? ' active' : '')}
            onClick={() => setRange(r.id)}
          >
            {r.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => window.print()}>
          <IconPrint size={12} /> Print to PDF
        </button>
      </div>

      {/* Metrics */}
      <div className="metric-grid" ref={metricGridRef}>
        <Metric label="Total hours" value={totalHours} accent />
        <Metric
          label="Retainership"
          value={retainerHours}
          delta={`${totalHours > 0 ? Math.round((retainerHours / totalHours) * 100) : 0}% of total`}
        />
        <Metric
          label="Non-retainership"
          value={outHours + internalHours}
          delta={`Out ${outHours.toFixed(0)}h · Internal ${internalHours.toFixed(0)}h`}
        />
        <Metric
          label="Active members"
          value={activeMemberSet.size}
          suffix=""
          delta={`of ${members.length} on the team`}
        />
      </div>

      {/* Projects + billing */}
      <div className="chart-grid">
        <div className="card">
          <div className="card-h">
            <h3>Hours by project</h3>
            <span className="sub">{projectRows.length} active · ranked by hours</span>
          </div>
          <div className="proj-rank-list">
            {projectRows.length === 0
              ? <p style={{ color: 'var(--ink-fade)', fontSize: 13, margin: 0 }}>No data for this period.</p>
              : projectRows.map((r, i) => {
                  const pct = totalHours > 0 ? (r.hours / totalHours) * 100 : 0;
                  const widthRel = (r.hours / maxProj) * 100;
                  return (
                    <div key={r.project.id} className="proj-rank-row">
                      <div className="rank-fill" style={{ width: widthRel + '%', background: `color-mix(in oklab, ${r.project.color} 22%, transparent)` }} />
                      <div className="rank-content">
                        <span className="rank-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="rank-swatch" style={{ background: r.project.color }} />
                        <div className="rank-info">
                          <span className="rank-name">{r.project.name}</span>
                          <span className="rank-client">{r.project.clientName}</span>
                        </div>
                        <span className="rank-pct">{pct.toFixed(0)}<span className="u">%</span></span>
                        <span className="rank-hrs">{r.hours.toFixed(1)}<span className="u">h</span></span>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Billing split</h3>
            <span className="sub">{totalHours.toFixed(0)}h across 3 buckets</span>
          </div>
          {(() => {
            const segs = [
              { id: 'retainer', label: 'Retainership',    hours: retainerHours, color: 'oklch(0.66 0.09 145)', note: 'In-scope retainer work' },
              { id: 'out',      label: 'Out of retainer', hours: outHours,      color: 'oklch(0.70 0.11 35)',  note: 'Over the retainer line' },
              { id: 'internal', label: 'Internal',        hours: internalHours, color: 'oklch(0.55 0.07 280)', note: 'Own studio work' },
            ];
            return (
              <>
                <div className="billing-bar">
                  {segs.map(s => {
                    const pct = totalHours > 0 ? (s.hours / totalHours) * 100 : 0;
                    return <div key={s.id} className="seg" style={{ width: pct + '%', background: s.color }} title={`${s.label} · ${s.hours.toFixed(1)}h · ${pct.toFixed(0)}%`} />;
                  })}
                </div>
                <div className="billing-stats">
                  {segs.map(s => {
                    const pct = totalHours > 0 ? (s.hours / totalHours) * 100 : 0;
                    return (
                      <div key={s.id} className="b-stat">
                        <div className="b-stat-row">
                          <span className="b-sw" style={{ background: s.color }} />
                          <span className="b-label">{s.label}</span>
                          <span className="b-pct">{pct.toFixed(0)}%</span>
                        </div>
                        <div className="b-num">{s.hours.toFixed(1)}<span className="u">h</span></div>
                        <div className="b-note">{s.note}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Daily stacked chart */}
      <div className="card">
        <div className="card-h">
          <h3>Daily hours</h3>
          <span className="sub">stacked by person · {nChart} days</span>
        </div>
        <div className="stacked-wrap">
          <div className="stacked-chart" style={{ gap: gapPx }}>
            {chartDays.map(([d, v]) => {
              const dt = new Date(d + 'T00:00:00');
              const isWE = isWeekend(dt);
              const isHol = !!holidays[d];
              return (
                <div
                  key={d}
                  className={['col', isWE ? 'weekend' : '', isHol ? 'holiday' : ''].filter(Boolean).join(' ')}
                  title={`${d} · ${v.total.toFixed(1)}h${isHol ? ' · ' + holidays[d] : ''}`}
                  style={colW ? { flex: 'none', width: colW } : undefined}
                >
                  {Object.entries(v.members).map(([mid, h]) => {
                    const mem = members.find(x => x.id === mid);
                    const color = mid === '__meet' ? 'var(--ink-ghost)' : mem ? mem.color : 'var(--ink-ghost)';
                    return <div key={mid} className="seg" style={{ height: (h / maxDay) * 200, background: color }} />;
                  })}
                  {dt.getDate() === 1 && <div className="lbl" style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>{monShort(dt)}</div>}
                  {[1, 8, 15, 22, 29].includes(dt.getDate()) && dt.getDate() !== 1 && <div className="lbl">{dt.getDate()}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hours by team + daily target */}
      <div className="chart-grid">
        <div className="card">
          <div className="card-h">
            <h3>Hours by team</h3>
            <span className="sub">members in view</span>
          </div>
          <div className="bar-list">
            {memberRows.map(r => (
              <BarRow
                key={r.member.id}
                label={
                  <>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: r.member.color, display: 'grid', placeItems: 'center', color: 'var(--paper)', fontFamily: 'var(--font-serif)', fontSize: 10, flexShrink: 0 }}>
                      {r.member.init.slice(0, 1)}
                    </span>
                    {r.member.name}
                  </>
                }
                value={r.hours}
                max={maxMem}
                color={r.member.color}
              />
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Daily target</h3>
            <span className="sub">avg vs {DAILY_TARGET}h</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 42, lineHeight: 1, fontWeight: 400 }}>{studioAvg.toFixed(1)}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-fade)' }}>h / member / working day</span>
            </div>
            <div className="goal-bar">
              <div
                className={`goal-bar-fill${studioAvg >= DAILY_TARGET * 0.9 ? '' : studioAvg >= DAILY_TARGET * 0.7 ? ' warm' : ' warn'}`}
                style={{ width: Math.min(100, (studioAvg / DAILY_TARGET) * 100) + '%' }}
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-fade)' }}>
              {studioAvg >= DAILY_TARGET
                ? 'On target. Beautiful pace this period.'
                : `${(DAILY_TARGET - studioAvg).toFixed(1)}h short of the daily target on average.`}
            </div>
            {belowTarget.length > 0 && (
              <>
                <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-fade)' }}>
                  Days below target ↓
                </div>
                <div className="below-target-chips">
                  {belowTarget.map(d => {
                    const dt = new Date(d + 'T00:00:00');
                    return (
                      <span key={d} className="chip">
                        {pad(dt.getDate())}/{pad(dt.getMonth() + 1)} <span style={{ color: 'var(--ink-fade)' }}>{dowShort(dt)}</span>
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Overtime + quick stats */}
      <div className="chart-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="card-h">
            <h3>Overtime</h3>
            <span className="sub">days over 9h · informative</span>
          </div>
          {overtime.length > 0 ? (
            <table className="over-table">
              <thead>
                <tr><th>Member</th><th>Days</th><th>Highest</th></tr>
              </thead>
              <tbody>
                {overtime.map(r => (
                  <tr key={r.member.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: r.member.color, display: 'grid', placeItems: 'center', color: 'var(--paper)', fontFamily: 'var(--font-serif)', fontSize: 11 }}>
                          {r.member.init.slice(0, 1)}
                        </span>
                        {r.member.name}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.days.length}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{Math.max(...r.days.map(d => d.hours)).toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--ink-fade)', fontSize: 13, margin: '16px 0 0' }}>No one&apos;s pulling overtime in this range. Steady hands.</p>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Quick stats</h3>
            <span className="sub">at a glance</span>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
            {[
              {
                label: 'Busiest day',
                value: busiestDay ? `${pad(new Date(busiestDay[0] + 'T00:00:00').getDate())} ${monShort(new Date(busiestDay[0] + 'T00:00:00'))}` : '—',
                sub: busiestDay ? busiestDay[1].total.toFixed(1) + 'h studio total' : '',
              },
              { label: 'Avg daily',      value: avgDaily.toFixed(1) + 'h', sub: 'per working day' },
              { label: 'No-entry days',  value: String(noEntryDays),       sub: 'blank weekdays in range' },
              { label: 'Entries',        value: String(filtered.length),   sub: 'logged in range' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-fade)' }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginTop: 4 }}>{s.value}</div>
                <div style={{ color: 'var(--ink-fade)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

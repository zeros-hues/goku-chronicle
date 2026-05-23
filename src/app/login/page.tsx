'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ENTRIES, MEMBERS, HOLIDAYS, entryHours, fmtDate, isWeekend, TODAY } from '@/lib/data';

const TODAY_STR = fmtDate(TODAY);

const VALID_CREDENTIALS = [
  { email: 'admin@gokustudio.com', password: 'chronicle2026' },
  { email: 'gokul@gokustudio.com', password: 'chronicle2026' },
];

function buildHeatmap() {
  const daily: Record<string, number> = {};
  ENTRIES.filter(e => !e.trashed).forEach(e => {
    daily[e.date] = (daily[e.date] ?? 0) + entryHours(e);
  });

  const start = new Date(TODAY);
  start.setDate(start.getDate() - 26 * 7);
  const dow = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dow);

  const cells: { date: string; hours: number; isToday: boolean; isHoliday: boolean; isWeekend: boolean }[] = [];
  const d = new Date(start);
  while (d <= new Date(TODAY)) {
    const s = fmtDate(d);
    cells.push({ date: s, hours: daily[s] ?? 0, isToday: s === TODAY_STR, isHoliday: !!HOLIDAYS[s], isWeekend: isWeekend(d) });
    d.setDate(d.getDate() + 1);
  }
  return cells;
}

function heatColor(h: number) {
  if (h === 0) return 'var(--paper-edge)';
  if (h <= 2)  return 'oklch(0.84 0.06 45)';
  if (h <= 4)  return 'oklch(0.74 0.10 44)';
  if (h <= 6)  return 'oklch(0.64 0.13 42)';
  if (h <= 8)  return 'oklch(0.56 0.15 40)';
  return             'oklch(0.48 0.16 37)';
}

function MonthAxis({ cells, weeks }: { cells: ReturnType<typeof buildHeatmap>; weeks: number }) {
  const labels: { col: number; label: string }[] = [];
  cells.forEach((cell, i) => {
    const col = Math.floor(i / 7);
    const d   = new Date(cell.date + 'T00:00:00');
    if (d.getDate() <= 7) {
      labels.push({ col, label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] });
    }
  });

  return (
    <div className="ledger-month-axis" style={{ gridTemplateColumns: `20px repeat(${weeks}, 1fr)` }}>
      <span />
      {labels.map(({ col, label }) => (
        <span key={col} style={{ gridColumnStart: col + 2 }}>{label}</span>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [shaking,  setShaking]  = useState(false);

  const cells         = buildHeatmap();
  const weeks         = Math.ceil(cells.length / 7);
  const totalHours    = ENTRIES.filter(e => !e.trashed).reduce((s, e) => s + entryHours(e), 0);
  const totalEntries  = ENTRIES.filter(e => !e.trashed).length;
  const projectCount  = new Set(ENTRIES.filter(e => !e.trashed).map(e => e.projectId)).size;
  const activeMembers = MEMBERS.filter(m => m.active);

  function shake() {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      shake();
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      shake();
      return;
    }
    const valid = VALID_CREDENTIALS.some(c => c.email === email.toLowerCase() && c.password === password);
    if (!valid) {
      setError('Incorrect email or password.');
      shake();
      setPassword('');
      return;
    }
    router.push('/');
  }

  return (
    <div className="login-shell">

      {/* Left ledger */}
      <div className="ledger">
        <div className="ocean-overlay">
          <div className="ledger-header">
            <div>
              <h1 className="ledger-title">Chron<span className="i">i</span>cle.</h1>
              <p className="ledger-sub">Work log of Goku Studio</p>
            </div>
            <p className="ledger-tag">
              Every hour intentional.<br />
              Every project accounted for.
            </p>
          </div>

          <div className="ocean-bottom">
            <div className="ocean-counter" style={{ marginBottom: 32, alignSelf: 'flex-start' }}>
              <div className="oc-n">{Math.round(totalHours)}<span className="oc-of">h</span></div>
              <div className="oc-l">Total hours logged</div>
              <div className="oc-sub">{totalEntries} entries across {projectCount} projects in 2026</div>
            </div>

            <div className="ledger-heatmap">
              <MonthAxis cells={cells} weeks={weeks} />
              <div className="ledger-row">
                <div className="ledger-day-labels">
                  <span>M</span><span /><span>W</span><span /><span>F</span><span /><span>S</span>
                </div>
                <div className="heat-grid"
                  style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)`, gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', height: 96, width: '100%' }}>
                  {cells.map((cell, i) => (
                    <div
                      key={i}
                      className={['heat-cell', cell.isToday ? 'today' : '', cell.isHoliday ? 'holiday' : ''].filter(Boolean).join(' ')}
                      style={{ background: cell.isHoliday ? undefined : heatColor(cell.hours), animationDelay: `${Math.min(i * 4, 400)}ms` }}
                      title={`${cell.date}: ${cell.hours}h`}
                    />
                  ))}
                </div>
              </div>

              <div className="ledger-footer">
                <div style={{ display: 'flex', gap: 32 }}>
                  <div className="ledger-stat">
                    <div className="n">{Math.round(totalHours)}<span className="u">h</span></div>
                    <div className="l">Hours logged</div>
                  </div>
                  <div className="ledger-stat">
                    <div className="n">{totalEntries}</div>
                    <div className="l">Entries</div>
                  </div>
                  <div className="ledger-stat">
                    <div className="n">{projectCount}</div>
                    <div className="l">Projects</div>
                  </div>
                </div>
                <div className="legend">
                  <span>Less</span>
                  {[0, 2, 4, 6, 8, 10].map(h => (
                    <span key={h}><span className="swatch" style={{ background: heatColor(h) }} /></span>
                  ))}
                  <span>More</span>
                </div>
              </div>
            </div>

            <div className="annotation" style={{ position: 'absolute', bottom: 56, right: 72 }}>
              2026 so far ↗
            </div>
          </div>
        </div>
      </div>

      {/* Right login panel */}
      <div className="login-panel">
        <div className={`login-card${shaking ? ' shake' : ''}`}>

          <p className="welcome">Welcome back.</p>
          <p className="welcome-sub">Sign in to your Chronicle workspace.</p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-block">
              <label className="field-label">Email</label>
              <input
                type="email"
                className={'field-input' + (error ? ' field-error' : '')}
                placeholder="you@gokustudio.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="input-block">
              <label className="field-label">Password</label>
              <input
                type="password"
                className={'field-input' + (error ? ' field-error' : '')}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="login-error">{error}</div>
            )}

            <button type="submit" className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
              Sign in
            </button>
          </form>

          <div className="login-meta">
            <span>Goku Studio workspace</span>
            <a href="#" onClick={e => { e.preventDefault(); alert('Contact admin@gokustudio.com to reset your password.'); }}>
              Forgot password?
            </a>
          </div>

          <div className="recent-users">
            {activeMembers.map(m => (
              <div key={m.id} className="ru" onClick={() => router.push('/')}>
                <div className="av" style={{ background: m.color }}>{m.init.slice(0, 1)}</div>
                <span className="nm">{m.init}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

    </div>
  );
}

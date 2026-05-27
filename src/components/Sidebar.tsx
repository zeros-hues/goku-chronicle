'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { View, Theme, Member } from '@/lib/data';
import {
  IconTimesheet, IconExport, IconTrash,
  IconClients, IconTeam, IconAccount,
  IconMoon, IconSun, IconSignOut, IconClock, IconCaret,
} from './Icons';

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  count?: number | null;
}

interface SidebarProps {
  view: View;
  navigate: (v: View) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  trashCount: number;
  currentUser: Member;
  onSignOut: () => void;
  activityCount: number;
  onActivityClick: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'timesheet', label: 'Timesheet', icon: <IconTimesheet size={16} /> },
  { id: 'export',    label: 'Export',    icon: <IconExport    size={16} /> },
  { id: 'trash',     label: 'Trash',     icon: <IconTrash     size={16} /> },
];

const SETTINGS_ITEMS: NavItem[] = [
  { id: 'clients', label: 'Clients & Projects', icon: <IconClients size={16} /> },
  { id: 'team',    label: 'Team Members',       icon: <IconTeam    size={16} /> },
  { id: 'account', label: 'Account',            icon: <IconAccount size={16} /> },
];

export default function Sidebar({
  view, navigate, theme, setTheme, trashCount, currentUser, onSignOut,
  activityCount, onActivityClick, isCollapsed, onToggle,
}: SidebarProps) {
  const isDark    = theme === 'dark';
  const sidebarRef = useRef<HTMLElement | null>(null);
  const tlRef      = useRef<gsap.core.Timeline | null>(null);

  /* ── Set sidebar width from persisted state on mount ──────── */
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    sidebar.style.width = isCollapsed ? '56px' : '224px';

    if (!isCollapsed) {
      const ctx = gsap.context(() => {
        gsap.fromTo('.nav-item',
          { opacity: 0, x: -8 },
          { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out', stagger: 0.04, clearProps: 'x,opacity' },
        );
      }, sidebar);
      return () => ctx.revert();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Toggle animation ─────────────────────────────────────── */
  function handleToggle() {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    tlRef.current?.kill();
    const collapsing = !isCollapsed;
    const tl = gsap.timeline();
    tlRef.current = tl;

    if (collapsing) {
      const labels = sidebar.querySelectorAll('.sidebar-label');
      tl.to(labels, { opacity: 0, x: -8, duration: 0.15, stagger: 0.02 })
        .to(sidebar, { width: 56, duration: 0.25, ease: 'power2.inOut' }, '-=0.05')
        .call(() => {
          onToggle();
          gsap.set(sidebar, { clearProps: 'width' });
          // Keep opacity:0 on labels so expand animation has a known start state
        });
    } else {
      onToggle();
      // Wait for React re-render before querying newly-visible labels
      requestAnimationFrame(() => {
        const labels = sidebar.querySelectorAll('.sidebar-label');
        gsap.set(labels, { opacity: 0, x: -8 });
        tl.to(sidebar, { width: 224, duration: 0.25, ease: 'power2.inOut' })
          .to(labels, { opacity: 1, x: 0, duration: 0.15, stagger: 0.02 }, '-=0.1')
          .call(() => {
            gsap.set(sidebar, { clearProps: 'width' });
            gsap.set(labels, { clearProps: 'opacity,x' });
          });
      });
    }
  }

  const navItems: NavItem[] = NAV_ITEMS.map(n =>
    n.id === 'trash' ? { ...n, count: trashCount || null } : n
  );

  function Tip({ label }: { label: string }) {
    if (!isCollapsed) return null;
    return <div className="sidebar-tooltip" role="tooltip">{label}</div>;
  }

  return (
    <nav
      className={'sidebar' + (isCollapsed ? ' collapsed' : '')}
      ref={node => { sidebarRef.current = node; }}
      aria-label="Main navigation"
    >
      {/* Collapse / expand toggle */}
      <button
        className="sidebar-toggle-btn"
        onClick={handleToggle}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.25s ease', display: 'flex' }}>
          <IconCaret size={10} />
        </span>
      </button>

      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className="sidebar-brand">
        <div className="mark">
          {isCollapsed
            ? <>C<span className="i">.</span></>
            : <>Chronicle<span className="i">.</span></>
          }
        </div>
        <div className="studio sidebar-label">WORK LOG OF GOKU STUDIO :)</div>
      </div>

      {/* ── Primary nav ───────────────────────────────────────── */}
      {navItems.map(n => (
        <div
          key={n.id}
          className={'nav-item' + (view === n.id ? ' active' : '')}
          onClick={() => navigate(n.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && navigate(n.id)}
        >
          <div className="nav-icon-pill">{n.icon}</div>
          <span className="sidebar-label">{n.label}</span>
          {n.count != null && (
            <span className={'count' + (isCollapsed ? '' : ' sidebar-label')}>
              {n.count}
            </span>
          )}
          <Tip label={n.label} />
        </div>
      ))}

      {/* ── Activity ──────────────────────────────────────────── */}
      <div
        className="nav-item"
        onClick={onActivityClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onActivityClick()}
      >
        <div className="nav-icon-pill">
          <IconClock size={16} />
          {activityCount > 0 && isCollapsed && (
            <span className="nav-icon-badge">
              {activityCount > 9 ? '9+' : activityCount}
            </span>
          )}
        </div>
        <span className="sidebar-label">Activity</span>
        {activityCount > 0 && !isCollapsed && (
          <span className="count sidebar-label">{activityCount}</span>
        )}
        {activityCount > 0 && isCollapsed && (
          // count badge shown on icon; label for tooltip
          <Tip label={`Activity (${activityCount})`} />
        )}
        {activityCount === 0 && <Tip label="Activity" />}
      </div>

      {/* ── Settings group ────────────────────────────────────── */}
      <div className="nav-group-label sidebar-label">Settings</div>
      {SETTINGS_ITEMS.map(n => (
        <div
          key={n.id}
          className={'nav-item' + (view === n.id ? ' active' : '')}
          onClick={() => navigate(n.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && navigate(n.id)}
        >
          <div className="nav-icon-pill">{n.icon}</div>
          <span className="sidebar-label">{n.label}</span>
          <Tip label={n.label} />
        </div>
      ))}

      <div className="sidebar-spacer" />

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="sidebar-footer">

        {/* Theme toggle */}
        <div
          className="nav-item"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setTheme(isDark ? 'light' : 'dark')}
        >
          <div className="nav-icon-pill">
            {isDark ? <IconMoon size={16} /> : <IconSun size={16} />}
          </div>
          <span className="sidebar-label" style={{ flex: 1 }}>
            {isDark ? 'Dark mode' : 'Light mode'}
          </span>
          <div className={'toggle-track sidebar-label' + (isDark ? ' on' : '')}>
            <div className="toggle-knob" />
          </div>
          <Tip label={isDark ? 'Dark mode' : 'Light mode'} />
        </div>

        {/* Sign out */}
        <div
          className="nav-item"
          onClick={onSignOut}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSignOut()}
        >
          <div className="nav-icon-pill"><IconSignOut size={16} /></div>
          <span className="sidebar-label">Sign out</span>
          <Tip label="Sign out" />
        </div>

        {/* User chip — hidden when collapsed */}
        {!isCollapsed && (
          <div className="user-chip">
            <div className={'avatar ' + currentUser.avatarClass}>
              {currentUser.init.slice(0, 1)}
            </div>
            <div>
              <div className="name">{currentUser.name}</div>
              <div className="role">GOKU STUDIO</div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

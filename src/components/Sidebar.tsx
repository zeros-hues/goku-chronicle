'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useRouter } from 'next/navigation';
import type { View, Theme, Member } from '@/lib/data';
import {
  IconTimesheet, IconExport, IconTrash,
  IconClients, IconTeam, IconAccount,
  IconMoon, IconSun, IconSignOut, IconClock,
} from './Icons';

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  count?: number | null;
}

interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  trashCount: number;
  currentUser: Member;
  onSignOut: () => void;
  activityCount: number;
  onActivityClick: () => void;
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
  view, setView, theme, setTheme, trashCount, currentUser, onSignOut,
  activityCount, onActivityClick,
}: SidebarProps) {
  const router = useRouter();
  const isDark = theme === 'dark';
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sidebarRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.nav-item',
        { opacity: 0, x: -8 },
        { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out', stagger: 0.04, clearProps: 'x,opacity' },
      );
    }, sidebarRef);
    return () => ctx.revert();
  }, []);

  const navItems: NavItem[] = NAV_ITEMS.map(n =>
    n.id === 'trash' ? { ...n, count: trashCount || null } : n
  );

  return (
    <aside className="sidebar" ref={sidebarRef}>
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="mark">
          Chronicle<span className="i">.</span>
        </div>
        <div className="studio">WORK LOG OF GOKU STUDIO :)</div>
      </div>

      {/* Primary nav */}
      {navItems.map(n => (
        <div
          key={n.id}
          className={'nav-item' + (view === n.id ? ' active' : '')}
          onClick={() => setView(n.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setView(n.id)}
        >
          {n.icon}
          <span>{n.label}</span>
          {n.count != null && <span className="count">{n.count}</span>}
        </div>
      ))}

      {/* Activity log trigger */}
      <div
        className="nav-item"
        onClick={onActivityClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onActivityClick()}
      >
        <IconClock size={16} />
        <span>Activity</span>
        {activityCount > 0 && <span className="count">{activityCount}</span>}
      </div>

      {/* Settings group */}
      <div className="nav-group-label">Settings</div>
      {SETTINGS_ITEMS.map(n => (
        <div
          key={n.id}
          className={'nav-item' + (view === n.id ? ' active' : '')}
          onClick={() => setView(n.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && setView(n.id)}
        >
          {n.icon}
          <span>{n.label}</span>
        </div>
      ))}

      <div className="sidebar-spacer" />

      {/* Footer */}
      <div className="sidebar-footer">
        {/* Theme toggle */}
        <button
          className="theme-toggle"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {isDark ? <IconMoon size={14} /> : <IconSun size={14} />}
          <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
          <div className="track">
            <div className="knob" />
          </div>
        </button>

        {/* Sign out */}
        <div
          className="nav-item"
          onClick={() => router.push('/login')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSignOut()}
          style={{ marginTop: 4 }}
        >
          <IconSignOut size={16} />
          <span>Sign out</span>
        </div>

        {/* User chip */}
        <div className="user-chip">
          <div className={'avatar ' + currentUser.avatarClass}>
            {currentUser.init.slice(0, 1)}
          </div>
          <div>
            <div className="name">{currentUser.name}</div>
            <div className="role">GOKU STUDIO</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

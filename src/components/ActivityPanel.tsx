'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { ActivityEvent } from '@/lib/data';
import { IconX } from './Icons';

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ActivityPanelProps {
  events: ActivityEvent[];
  onClose: () => void;
}

export default function ActivityPanel({ events, onClose }: ActivityPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current || events.length === 0) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.activity-item',
        { opacity: 0, x: 12 },
        { opacity: 1, x: 0, duration: 0.22, ease: 'power2.out', stagger: 0.05, clearProps: 'x,opacity' },
      );
    }, listRef);
    return () => ctx.revert();
  }, [events.length]);

  return (
    <div className="activity-panel">
      <div className="activity-panel-header">
        <h3>Activity<span className="i">.</span></h3>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close activity panel">
          <IconX size={14} />
        </button>
      </div>
      <div className="activity-panel-body" ref={listRef}>
        {events.length === 0 ? (
          <div className="activity-empty">
            <span className="icon">◎</span>
            <p>No activity yet. Actions you take will appear here.</p>
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className="activity-item">
              <span className="dot" />
              <div className="body">
                <div className="msg">{ev.text}</div>
                <div className="time">{relTime(ev.ts)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

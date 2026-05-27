'use client';

import { useRef, useEffect } from 'react';
import { IconCaret } from './Icons';

interface FilterChipProps {
  label: string;
  icon?: React.ReactNode;
  dot?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function FilterChip({ label, icon, dot, open, onToggle, children }: FilterChipProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onToggle]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={'filter-chip' + (dot ? ' active' : '')} onClick={onToggle}>
        {icon}
        {dot && !icon && <span className="dot" />}
        <span>{label}</span>
        <IconCaret size={10} className="caret" />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={onToggle} />
          <div className="dropdown">{children}</div>
        </>
      )}
    </div>
  );
}

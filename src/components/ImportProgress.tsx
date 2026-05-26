'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { Entry } from '@/lib/data';
import { IconCheck } from './Icons';

interface ImportProgressProps {
  entries: Entry[];
}

export default function ImportProgress({ entries }: ImportProgressProps) {
  const total      = entries.length;
  const cols       = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows       = Math.ceil(total / cols);
  const cellCount  = rows * cols;

  const [current,  setCurrent]  = useState(0);
  const [taskName, setTaskName] = useState('');
  const dotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const tlRef   = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (total === 0) return;

    // Animate dots over estimated duration: 180ms per entry, 1.5s–7s window
    const duration = Math.min(Math.max(total * 0.18, 1.5), 7);
    const tl = gsap.timeline();
    tlRef.current = tl;

    for (let i = 0; i < total; i++) {
      const t = (i / total) * duration;
      tl.call(() => {
        setCurrent(i + 1);
        if (entries[i]) setTaskName(entries[i].task);
        const dot = dotsRef.current[i];
        if (dot) {
          dot.classList.add('filled');
          gsap.fromTo(dot,
            { scale: 0 },
            { scale: 1, duration: 0.28, ease: 'back.out(2)', overwrite: 'auto' }
          );
        }
      }, [], t);
    }

    return () => { tl.kill(); };
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDone = current >= total && total > 0;

  return (
    <div className="import-progress">
      {/* Dot grid */}
      <div
        className="ip-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 8px)`,
          gap: 6,
        }}
      >
        {Array.from({ length: cellCount }, (_, i) => (
          <div
            key={i}
            ref={el => { dotsRef.current[i] = el; }}
            className={`ip-dot${i >= total ? ' inactive' : ''}`}
          />
        ))}
      </div>

      {/* Counter */}
      <div className="ip-counter">
        {isDone ? (
          <span className="ip-done">
            <IconCheck size={13} /> {total} {total === 1 ? 'entry' : 'entries'} recorded
          </span>
        ) : total === 0 ? (
          'Preparing…'
        ) : (
          `Saving ${current} of ${total} ${total === 1 ? 'entry' : 'entries'}…`
        )}
      </div>

      {/* Ticker */}
      {!isDone && taskName && (
        <div className="ip-ticker">
          <span key={taskName}>{taskName}</span>
        </div>
      )}
    </div>
  );
}

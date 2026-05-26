'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface PageTransitionProps {
  children: React.ReactNode;
}

export default function PageTransition({ children }: PageTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el, {
        y: 10,
        opacity: 0,
        duration: 0.28,
        ease: 'power2.out',
        clearProps: 'y,opacity',
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="page-transition">
      {children}
    </div>
  );
}

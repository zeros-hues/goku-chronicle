'use client';

import { useState, useCallback, useEffect } from 'react';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const openPalette = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return { open, openPalette, close };
}

'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fmtDate } from '@/lib/data';

export type DatePreset =
  | 'today' | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'last_30' | 'last_60'
  | 'this_year' | 'all' | 'custom';

export type BillingFilter = 'all' | 'retainer' | 'out' | 'internal';

export interface SharedFilters {
  dateRange: {
    preset: DatePreset;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
  };
  clientId: string | null;
  billingType: BillingFilter;
}

interface FilterContextType {
  filters: SharedFilters;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  setClient: (clientId: string | null) => void;
  setBillingType: (type: BillingFilter) => void;
  resetFilters: () => void;
}

export function getPresetRange(preset: DatePreset): { startDate: string; endDate: string } {
  const today = new Date();
  const year  = today.getFullYear();
  const month = today.getMonth();

  switch (preset) {
    case 'today': {
      const d = fmtDate(today);
      return { startDate: d, endDate: d };
    }
    case 'this_week': {
      const day = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { startDate: fmtDate(mon), endDate: fmtDate(sun) };
    }
    case 'last_week': {
      const day = today.getDay();
      const mon = new Date(today);
      mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) - 7);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return { startDate: fmtDate(mon), endDate: fmtDate(sun) };
    }
    case 'last_30': {
      const s = new Date(today); s.setDate(today.getDate() - 30);
      return { startDate: fmtDate(s), endDate: fmtDate(today) };
    }
    case 'last_60': {
      const s = new Date(today); s.setDate(today.getDate() - 60);
      return { startDate: fmtDate(s), endDate: fmtDate(today) };
    }
    case 'this_month':
      return {
        startDate: fmtDate(new Date(year, month, 1)),
        endDate:   fmtDate(new Date(year, month + 1, 0)),
      };
    case 'last_month':
      return {
        startDate: fmtDate(new Date(year, month - 1, 1)),
        endDate:   fmtDate(new Date(year, month, 0)),
      };
    case 'this_year':
      return {
        startDate: fmtDate(new Date(year, 0, 1)),
        endDate:   fmtDate(new Date(year, 11, 31)),
      };
    case 'all':
      return { startDate: '2020-01-01', endDate: fmtDate(new Date(year + 1, 11, 31)) };
    default:
      // 'custom' falls here — caller supplies dates separately
      return {
        startDate: fmtDate(new Date(year, month, 1)),
        endDate:   fmtDate(new Date(year, month + 1, 0)),
      };
  }
}

const DEFAULT_FILTERS: SharedFilters = {
  dateRange: { preset: 'this_month', ...getPresetRange('this_month') },
  clientId:    null,
  billingType: 'all',
};

const FilterContext = createContext<FilterContextType>({
  filters:        DEFAULT_FILTERS,
  setPreset:      () => {},
  setCustomRange: () => {},
  setClient:      () => {},
  setBillingType: () => {},
  resetFilters:   () => {},
});

const STORAGE_KEY = 'chronicle-shared-filters';

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<SharedFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SharedFilters;
        // Recalculate preset-based date ranges — days have passed since last visit
        if (parsed.dateRange.preset !== 'custom') {
          return { ...parsed, dateRange: { ...parsed.dateRange, ...getPresetRange(parsed.dateRange.preset) } };
        }
        return parsed;
      }
    } catch { /* ignore */ }
    return DEFAULT_FILTERS;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  const setPreset = useCallback((preset: DatePreset) => {
    setFilters(prev => ({ ...prev, dateRange: { preset, ...getPresetRange(preset) } }));
  }, []);

  const setCustomRange = useCallback((startDate: string, endDate: string) => {
    setFilters(prev => ({ ...prev, dateRange: { preset: 'custom', startDate, endDate } }));
  }, []);

  const setClient = useCallback((clientId: string | null) => {
    setFilters(prev => ({ ...prev, clientId }));
  }, []);

  const setBillingType = useCallback((billingType: BillingFilter) => {
    setFilters(prev => ({ ...prev, billingType }));
  }, []);

  const resetFilters = useCallback(() => { setFilters(DEFAULT_FILTERS); }, []);

  return (
    <FilterContext.Provider value={{ filters, setPreset, setCustomRange, setClient, setBillingType, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  return useContext(FilterContext);
}

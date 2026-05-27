'use client';

import { useState } from 'react';
import { useFilters } from '@/context/FilterContext';
import type { DatePreset, BillingFilter } from '@/context/FilterContext';
import type { Client } from '@/lib/data';
import FilterChip from './FilterChip';
import { IconCalendar } from './Icons';

export const TIMESHEET_RANGES: { id: DatePreset; label: string }[] = [
  { id: 'this_month', label: 'This month'   },
  { id: 'last_month', label: 'Last month'   },
  { id: 'last_30',    label: 'Last 30 days' },
  { id: 'last_60',    label: 'Last 60 days' },
  { id: 'this_year',  label: 'This year'    },
  { id: 'all',        label: 'All entries'  },
  { id: 'custom',     label: 'Custom'       },
];

export const DASHBOARD_RANGES: { id: DatePreset; label: string }[] = [
  { id: 'today',      label: 'Today'      },
  { id: 'this_week',  label: 'This week'  },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year',  label: 'This year'  },
];

interface SharedFilterBarProps {
  clients: Client[];
  ranges?: { id: DatePreset; label: string }[];
  showBilling?: boolean;
}

export default function SharedFilterBar({
  clients,
  ranges = TIMESHEET_RANGES,
  showBilling = true,
}: SharedFilterBarProps) {
  const { filters, setPreset, setCustomRange, setClient, setBillingType } = useFilters();
  const [openDrop, setOpenDrop] = useState<string | null>(null);

  function drop(key: string) { setOpenDrop(p => p === key ? null : key); }

  function handleClientSelect(clientId: string | null) {
    setClient(clientId);
    // Auto-reset billing when switching to an internal-only client
    if (clientId !== null) {
      const c = clients.find(x => x.id === clientId);
      if (c && !c.hasRetainership && filters.billingType === 'retainer') {
        setBillingType('internal');
      }
    }
    setOpenDrop(null);
  }

  const rangeLabel = ranges.find(r => r.id === filters.dateRange.preset)?.label
    ?? (filters.dateRange.preset === 'custom' ? 'Custom' : 'This month');
  const clientLabel = filters.clientId === null
    ? 'All clients'
    : (clients.find(c => c.id === filters.clientId)?.name ?? 'All clients');
  const billingLabel = filters.billingType === 'all'      ? 'All billing'
    : filters.billingType === 'retainer' ? 'Retainership'
    : filters.billingType === 'out'      ? 'Out of Retainer'
    : 'Internal';

  const supportsCustom = ranges.some(r => r.id === 'custom');

  return (
    <>
      {/* Date range */}
      <FilterChip
        label={rangeLabel}
        icon={<IconCalendar size={12} />}
        open={openDrop === 'range'}
        onToggle={() => drop('range')}
      >
        <div className="dropdown-section">Range</div>
        {ranges.filter(r => r.id !== 'custom').map(r => (
          <div key={r.id}
            className={'dropdown-item' + (filters.dateRange.preset === r.id ? ' selected' : '')}
            onClick={() => { setPreset(r.id); setOpenDrop(null); }}
          >
            {r.label}
          </div>
        ))}
        {supportsCustom && (
          <div
            className={'dropdown-item' + (filters.dateRange.preset === 'custom' ? ' selected' : '')}
            onClick={() => setCustomRange(filters.dateRange.startDate, filters.dateRange.endDate)}
          >
            Custom range…
          </div>
        )}
        {supportsCustom && filters.dateRange.preset === 'custom' && (
          <div
            style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="date"
              className="field-input"
              style={{ fontSize: 11, padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
              value={filters.dateRange.startDate}
              onChange={e => setCustomRange(e.target.value, filters.dateRange.endDate)}
            />
            <input
              type="date"
              className="field-input"
              style={{ fontSize: 11, padding: '4px 8px', fontFamily: 'var(--font-mono)' }}
              value={filters.dateRange.endDate}
              onChange={e => setCustomRange(filters.dateRange.startDate, e.target.value)}
            />
          </div>
        )}
      </FilterChip>

      {/* Client */}
      <FilterChip
        label={clientLabel}
        dot={filters.clientId !== null}
        open={openDrop === 'client'}
        onToggle={() => drop('client')}
      >
        <div
          className={'dropdown-item' + (filters.clientId === null ? ' selected' : '')}
          onClick={() => handleClientSelect(null)}
        >
          All clients
        </div>
        {clients.length > 0 && <div className="dropdown-section">Clients</div>}
        {clients.map(c => (
          <div key={c.id}
            className={'dropdown-item' + (filters.clientId === c.id ? ' selected' : '')}
            onClick={() => handleClientSelect(c.id)}
          >
            {c.name}
          </div>
        ))}
      </FilterChip>

      {/* Billing */}
      {showBilling && (
        <FilterChip
          label={billingLabel}
          dot={filters.billingType !== 'all'}
          open={openDrop === 'billing'}
          onToggle={() => drop('billing')}
        >
          {([
            { id: 'all',      label: 'All billing'     },
            { id: 'retainer', label: 'Retainership'    },
            { id: 'out',      label: 'Out of Retainer' },
            { id: 'internal', label: 'Internal'        },
          ] as { id: BillingFilter; label: string }[]).map(o => (
            <div key={o.id}
              className={'dropdown-item' + (filters.billingType === o.id ? ' selected' : '')}
              onClick={() => { setBillingType(o.id); setOpenDrop(null); }}
            >
              {o.label}
            </div>
          ))}
        </FilterChip>
      )}
    </>
  );
}

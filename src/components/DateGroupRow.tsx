'use client';

import React from 'react';
import { dowFull, monShort, fmtDate, TODAY } from '@/lib/data';

function fmt(h: number) {
  return h % 1 === 0 ? String(h) : h.toFixed(1);
}

export const DateGroupRow = React.forwardRef<
  HTMLTableRowElement,
  { date: Date; colSpan: number }
>(function DateGroupRow({ date, colSpan }, ref) {
  const isToday = fmtDate(date) === fmtDate(TODAY);
  return (
    <tr className="date-group-row" ref={ref}>
      <td colSpan={colSpan}>
        <div className="date-block">
          <span className="day">{date.getDate()}</span>
          <span className="dow">{dowFull(date)}</span>
          <span className="mon">{monShort(date)}</span>
          {isToday && <span className="today-flag">Today</span>}
        </div>
      </td>
    </tr>
  );
});

export function DailyTotalRow({ colSpan, total }: { colSpan: number; total: number }) {
  return (
    <tr className="daily-total">
      <td colSpan={colSpan - 1} className="daily-total-label">
        Daily total
      </td>
      <td className="hrs total">
        <span className="v">{fmt(total)}</span>
        <span className="u">h</span>
      </td>
    </tr>
  );
}

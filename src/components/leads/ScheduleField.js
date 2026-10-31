'use client';

// The date a status change books: shown when the chosen status asks for a date (a callback, a site visit…), and the
// status cannot be saved without it. Used by the Manual, Meta and Google Ads lead details.
import { CalendarClock } from 'lucide-react';

export default function ScheduleField({ status, value, onChange, className = '' }) {
  if (!status?.requiresDate) return null;
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-slate-700"><CalendarClock className="h-3.5 w-3.5" />When is “{status.name}”?</span>
      <input type="datetime-local" required value={value || ''} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
    </label>
  );
}

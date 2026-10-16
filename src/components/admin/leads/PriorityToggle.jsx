import React from 'react';
import { Star } from 'lucide-react';

// Values for the "Priority" list filter. The API reads them from ?priority=.
export const PRIORITY_FILTER_OPTIONS = [
  { value: '', label: 'All leads' },
  { value: 'true', label: 'Priority only' },
  { value: 'false', label: 'Not priority' },
];

// Star button that marks a lead as a priority. With `withLabel` it shows text next to the star
// (used in the lead details window); otherwise it is an icon button for table rows.
const PriorityToggle = ({ active, onToggle, disabled = false, withLabel = false, readOnly = false }) => {
  const title = active ? 'Priority lead' : 'Not a priority';
  const actionTitle = active ? 'Remove priority' : 'Mark as priority';

  if (readOnly) {
    if (!active) return null;
    return (
      <span title={title} className="inline-flex shrink-0 items-center gap-1 text-amber-500">
        <Star className="h-4 w-4" fill="currentColor" />
        {withLabel && <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Priority</span>}
      </span>
    );
  }

  if (withLabel) {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={active}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${active
          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700'}`}
      >
        <Star className={`h-4 w-4 ${active ? 'text-amber-500' : ''}`} fill={active ? 'currentColor' : 'none'} />
        {active ? 'Priority' : 'Mark as priority'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      aria-label={actionTitle}
      title={actionTitle}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-60 ${active
        ? 'text-amber-500 hover:bg-amber-100'
        : 'text-slate-300 hover:bg-slate-100 hover:text-amber-500'}`}
    >
      <Star className="h-4 w-4" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
};

export default PriorityToggle;

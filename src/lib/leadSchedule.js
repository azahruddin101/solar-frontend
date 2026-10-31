// The date a lead status books (a callback, a site visit…): the filter choices and how the date is shown.
export const SCHEDULE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'upcoming', label: 'Upcoming (today onward)' },
  { value: 'today', label: 'Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'any', label: 'Has a date' },
  { value: 'rescheduled', label: 'Rescheduled' },
];

/** "Tue, 3 Nov 2026, 10:30 am" — the time only when one was set. */
export const formatSchedule = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const hasTime = date.getHours() || date.getMinutes();
  return date.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...(hasTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}) });
};

/** Is the booked date before today (the lead is still in that status, so the follow-up was missed)? */
export const isOverdue = (d) => {
  if (!d) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return new Date(d) < start;
};

/** A `datetime-local` input value for a stored date (the input needs local time without a zone). */
export const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

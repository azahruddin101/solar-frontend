// "Valid until": the last day a proposal's price and terms hold. Asked when a proposal is created (30 days by default).
export const DEFAULT_VALIDITY_DAYS = 30;

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' for a date input, in local time. */
export const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function defaultValidUntil(days = DEFAULT_VALIDITY_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

/** A stored date as 'YYYY-MM-DD' for the date input ('' when there is none). */
export const validUntilInput = (v) => (v ? toDateInput(new Date(v)) : '');

/** For the PDF: "31 October 2026" (or '' when not set). */
export const validUntilText = (v) => (v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

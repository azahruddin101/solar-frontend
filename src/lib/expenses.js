// Per-company expense reason labels (Manage Masters / Expenses › Reasons).

export const DEFAULT_EXPENSE_REASONS = [
  'Transport of material',
  'Labour charges',
  'Material purchase',
  'Structure fabrication',
  'Electrical work',
  'Permits & net-metering fees',
  'Travel & site visit',
  'Tools & equipment',
  'Food & accommodation',
  'Repair / rework',
];

export const MAX_EXPENSE_REASONS = 50;

/** The reasons this company offers when adding an expense. */
export function expenseReasonsFor(company) {
  const raw = company?.expenseReasons;
  if (Array.isArray(raw) && raw.length) return raw;
  return DEFAULT_EXPENSE_REASONS;
}

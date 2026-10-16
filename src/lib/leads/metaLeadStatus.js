// Colours an admin can pick for a Meta lead status, and their badge classes
export const STATUS_COLORS = [
  { value: 'slate', label: 'Grey', badge: 'bg-slate-100 text-slate-800', dot: 'bg-slate-400' },
  { value: 'blue', label: 'Blue', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  { value: 'amber', label: 'Amber', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { value: 'emerald', label: 'Green', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  { value: 'rose', label: 'Red', badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500' },
  { value: 'purple', label: 'Purple', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  { value: 'cyan', label: 'Cyan', badge: 'bg-cyan-100 text-cyan-800', dot: 'bg-cyan-500' },
];

const findColor = (color) => STATUS_COLORS.find((c) => c.value === color) || STATUS_COLORS[0];

export const statusBadgeClass = (color) => findColor(color).badge;
export const statusDotClass = (color) => findColor(color).dot;

// "which_course_interests_you?" -> "Which course interests you?"
export const formatFieldLabel = (key) => {
  const label = key.replace(/_/g, ' ').trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export const formatFieldValue = (value) => (Array.isArray(value) ? value.join(', ') : String(value ?? ''));

// Meta stores a Facebook inbox link on the lead. It is not shown in the lead popup.
export const isHiddenLeadField = (key) => String(key).replace(/[_\s]/g, '').toLowerCase() === 'inboxurl';

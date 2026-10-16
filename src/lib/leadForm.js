// The company's lead form for manual leads. Mirrors backend/leads-integration/utils/leadForm.js: Name, Phone and
// Address are on every form; the company adds its own fields under Manage Masters → Lead form.
import { AlignLeft, Calendar, CheckSquare, ChevronDownSquare, Hash, Mail, Phone, ToggleLeft, Type } from 'lucide-react';

export const FIELD_TYPES = [
  { id: 'text', label: 'Short text', icon: Type, hint: 'A name, a reference, a few words' },
  { id: 'textarea', label: 'Long text', icon: AlignLeft, hint: 'Notes, a description' },
  { id: 'number', label: 'Number', icon: Hash, hint: 'Monthly bill, roof area, load in kW' },
  { id: 'phone', label: 'Phone', icon: Phone, hint: 'Another contact number' },
  { id: 'email', label: 'Email', icon: Mail, hint: 'An email address' },
  { id: 'select', label: 'Dropdown', icon: ChevronDownSquare, hint: 'Pick one of a few choices' },
  { id: 'multiselect', label: 'Multiple choice', icon: CheckSquare, hint: 'Tick any of a few choices' },
  { id: 'date', label: 'Date', icon: Calendar, hint: 'A visit date, a follow-up date' },
  { id: 'yesno', label: 'Yes / No', icon: ToggleLeft, hint: 'A simple yes or no' },
];
export const FIELD_TYPE = Object.fromEntries(FIELD_TYPES.map((t) => [t.id, t]));
export const WITH_OPTIONS = ['select', 'multiselect'];
export const MAX_FIELDS = 40;

export const FIXED_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true, fixed: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: true, fixed: true },
  { key: 'address', label: 'Address', type: 'textarea', required: false, fixed: true },
];
export const FIXED_KEYS = FIXED_FIELDS.map((f) => f.key);

/** A lead's value for a field, from the API shape (name/phone/address on the lead, the rest in `fields`). */
export const leadValue = (lead, field) => (field.key === 'name' ? lead.fullName : FIXED_KEYS.includes(field.key) ? lead[field.key] : lead.fields?.[field.key]);

/** A value as text for tables and details. */
export function valueText(field, value) {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (field?.type === 'yesno') return value ? 'Yes' : 'No';
  if (field?.type === 'date') {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return String(value);
}

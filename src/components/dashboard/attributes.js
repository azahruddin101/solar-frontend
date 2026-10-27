'use client';

// Category attributes on screen: the inputs a product form shows for its category's attribute definitions, and
// the values as chips / facts. The server checks the same rules (backend services/attribute.service.js).
import { Badge, FormField, Input, Select } from '../kit';

export const MAX_ATTRIBUTES = 40;
export const ATTRIBUTE_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'number', label: 'Number' },
  { id: 'select', label: 'Choice list' },
  { id: 'boolean', label: 'Yes / no' },
];

/** The category's definitions in their order. */
export const sortedDefs = (category) => [...(category?.attributes || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

const blank = (v) => v === undefined || v === null || v === '';

/** A stored value as text: "Yes" / "No" for booleans, the value otherwise. */
export const attributeText = (def, value) => (blank(value) ? '' : def?.dataType === 'boolean' ? (value ? 'Yes' : 'No') : String(value));

/** [{ label, value }] of the values that are set, in the category's order; values for removed attributes come last under their key. */
export function attributeRows(category, attributes) {
  const values = attributes || {};
  const defs = sortedDefs(category);
  const defined = new Set(defs.map((d) => d.key));
  return [
    ...defs.filter((d) => !blank(values[d.key])).map((d) => ({ key: d.key, label: d.label, value: attributeText(d, values[d.key]) })),
    ...Object.entries(values).filter(([k, v]) => !defined.has(k) && !blank(v)).map(([k, v]) => ({ key: k, label: k, value: String(v) })),
  ];
}

/** Up to three values as chips, for table cells. */
export function AttributeChips({ category, attributes }) {
  const rows = attributeRows(category, attributes);
  if (!rows.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex max-w-[320px] flex-wrap gap-1">
      {rows.slice(0, 3).map((r) => <Badge key={r.key} className="max-w-[200px]"><span className="truncate"><span className="text-slate-500">{r.label}:</span> {r.value}</span></Badge>)}
      {rows.length > 3 && <span title={rows.slice(3).map((r) => `${r.label}: ${r.value}`).join('\n')}><Badge>+{rows.length - 3}</Badge></span>}
    </div>
  );
}

/** Checks the form values the way the server will, so required / number / choice errors show before saving. */
export function attributeErrors(category, values) {
  const errors = {};
  for (const d of sortedDefs(category)) {
    const v = values?.[d.key];
    if (blank(v)) {
      if (d.isRequired) errors[d.key] = `${d.label} is required`;
    } else if (d.dataType === 'number' && !Number.isFinite(Number(v))) errors[d.key] = `${d.label} must be a number`;
    else if (d.dataType === 'select' && !d.options.includes(v)) errors[d.key] = `${d.label} must be one of: ${d.options.join(', ')}`;
  }
  return errors;
}

/** Form values → what is sent: numbers as numbers, blanks as null (so a cleared value is removed). */
export function attributePayload(category, values) {
  const out = { ...(values || {}) };
  for (const d of sortedDefs(category)) {
    const v = out[d.key];
    if (blank(v)) out[d.key] = null;
    else if (d.dataType === 'number') out[d.key] = Number(v);
  }
  return out;
}

/** One input per attribute of the category: text, number, a choice list, or yes / no. */
export function AttributeFields({ category, values, onChange, errors = {} }) {
  const defs = sortedDefs(category);
  if (!defs.length) return <p className="text-xs text-slate-500">This category has no attributes. Add them under Catalog categories to describe its products.</p>;
  const set = (key, v) => onChange({ ...(values || {}), [key]: v });
  const valueOf = (key) => values?.[key] ?? '';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {defs.map((d) => (
        <FormField key={d.key} label={d.label} optional={!d.isRequired} error={errors[d.key]}>
          {d.dataType === 'select' ? (
            <Select value={valueOf(d.key)} onValue={(v) => set(d.key, v)}>
              <option value="">—</option>
              {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          ) : d.dataType === 'boolean' ? (
            <Select value={blank(values?.[d.key]) ? '' : values[d.key] ? 'yes' : 'no'} onValue={(v) => set(d.key, v === '' ? '' : v === 'yes')}>
              <option value="">—</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          ) : (
            <Input type={d.dataType === 'number' ? 'number' : 'text'} step="any" maxLength={200} value={valueOf(d.key)} onValue={(v) => set(d.key, v)} />
          )}
        </FormField>
      ))}
    </div>
  );
}

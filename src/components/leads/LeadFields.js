'use client';

// The inputs of a company's lead form (Name, Phone, Address, then its own fields), used by Add lead, Edit lead and
// the live preview in Manage Masters → Lead form. `values` is keyed by field key; `errors` too.
import { cx, FormField, Input, PhoneInput, Select, Textarea } from '../kit';

export default function LeadFields({ fields, values, onChange, errors = {}, disabled = false }) {
  const set = (key, value) => onChange({ ...values, [key]: value });
  return (
    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
      {fields.map((f) => {
        const wide = f.type === 'textarea' || f.type === 'multiselect' || f.key === 'address';
        const v = values[f.key];
        let input;
        switch (f.type) {
          case 'textarea':
            input = <Textarea rows={f.key === 'address' ? 2 : 3} maxLength={2000} value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} />;
            break;
          case 'number':
            input = <Input type="number" inputMode="decimal" step="any" value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} />;
            break;
          case 'phone':
            input = <PhoneInput maxLength={20} value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} />;
            break;
          case 'email':
            input = <Input type="email" maxLength={200} value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} placeholder="name@example.com" />;
            break;
          case 'date':
            input = <Input type="date" value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} />;
            break;
          case 'select':
            input = (
              <Select value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled}>
                <option value="">Choose…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            );
            break;
          case 'multiselect': {
            const list = Array.isArray(v) ? v : [];
            input = (
              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                {f.options.map((o) => (
                  <label key={o} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                    <input type="checkbox" disabled={disabled} checked={list.includes(o)} onChange={() => set(f.key, list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand" />
                    {o}
                  </label>
                ))}
              </div>
            );
            break;
          }
          case 'yesno':
            input = (
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label={f.label}>
                {[['', 'Not set'], [true, 'Yes'], [false, 'No']].map(([val, label]) => {
                  const on = val === '' ? v === undefined || v === '' || v === null : v === val;
                  return (
                    <button key={label} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => set(f.key, val)} className={cx('rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors', on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                      {label}
                    </button>
                  );
                })}
              </div>
            );
            break;
          default:
            input = <Input maxLength={f.key === 'name' ? 120 : 200} value={v ?? ''} onValue={(x) => set(f.key, x)} disabled={disabled} placeholder={f.key === 'name' ? 'Full name' : undefined} />;
        }
        return (
          <FormField key={f.key} className={wide ? 'sm:col-span-2' : undefined} label={f.label} optional={!f.required} hint={f.help || undefined} error={errors[f.key]}>
            {input}
          </FormField>
        );
      })}
    </div>
  );
}

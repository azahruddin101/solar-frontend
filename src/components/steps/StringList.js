'use client';

// String layout: the strings of the design (picked by hand first, then the automatic ones), with the
// string tool to fill a picked string by tapping panels in 3D or on the plan.

import { Check, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { adoptAutoStrings, clearStrings, editString, finishString, newString, removeString, renameString } from '@/lib/strings';
import { useStore } from '@/lib/store';
import { baseLabel } from '@/lib/autofill';
import { cx } from '../ui';

export default function StringList({ design }) {
  const picked = useStore((s) => s.electrical.strings || []);
  const activeId = useStore((s) => s.activeStringId);
  const tool = useStore((s) => s.tool);
  const el = design.electrical;
  const armed = tool === 'string';
  // open a string to change its panels: an automatic one becomes a picked one first
  const open = (st) => (st.manual ? editString(st.id) : adoptAutoStrings(el, st.index));

  // the rows: every picked string (even one still empty), then the automatic ones
  const byId = new Map((el.strings || []).filter((st) => st.manual).map((st) => [st.id, st]));
  const rows = [
    ...picked.map((ps, i) => ({ ...(byId.get(ps.id) || { name: ps.name || `String ${i + 1}`, count: 0, voc: 0, color: '#94a3b8', modules: [] }), id: ps.id, manual: true, storeName: ps.name }),),
    ...(el.strings || []).filter((st) => !st.manual),
  ];
  // the bases a string runs over, named as the Panels step names them
  const arrays = useStore((s) => s.objects).filter((o) => o.type === 'array');
  const labelOf = (t) => {
    const i = arrays.findIndex((o) => o.id === t?.source);
    return i >= 0 ? baseLabel(arrays[i], i) : t?.name;
  };
  const baseNames = (st) => [...new Set((st.modules || []).map((id) => labelOf(design.tables.find((t) => id.startsWith(`${t.id}:`)))).filter(Boolean))].join(', ');

  return (
    <div className="space-y-2">
      {rows.map((st) => {
        const isActive = armed && st.id && st.id === activeId;
        const warn = st.tooLong ? `Too many panels for the inverter (max ${el.maxLen})` : st.tooShort && st.count > 0 ? `Too few panels (min ${el.minLen})` : st.manual && st.count === 0 ? 'Empty: tap panels on the roof to fill it' : '';
        return (
          <div key={st.id || st.name} onClick={(e) => !isActive && !e.target.closest('button,input') && open(st)} className={cx('rounded-md border px-3 py-2', isActive ? 'border-brand bg-brand-soft/40 ring-2 ring-brand/20' : 'cursor-pointer border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rounded-full border border-white shadow" style={{ background: st.color }} />
              {st.manual && isActive
                ? <input value={st.storeName || ''} placeholder={st.name} onChange={(e) => renameString(st.id, e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-sm outline-none focus:border-brand" />
                : <span className="min-w-0 flex-1 truncate text-sm font-semibold">{st.name}{st.manual ? '' : <span className="ml-1.5 text-xs font-normal text-slate-500">auto</span>}</span>}
              <span className="text-xs text-slate-600">{st.count} panel{st.count === 1 ? '' : 's'}{st.count ? ` · ${Math.round(st.voc)} V` : ''}</span>
              {isActive
                ? <button type="button" title="Done with this string (Enter)" onClick={finishString} className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-white hover:bg-slate-800"><Check className="h-4 w-4" /></button>
                : <button type="button" title={st.manual ? 'Pick the panels of this string' : 'Edit this string (the automatic strings are kept as they are)'} onClick={() => open(st)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" /></button>}
              {st.manual && <button type="button" title="Remove this string (its panels go back to automatic)" onClick={() => removeString(st.id)} className="grid h-7 w-7 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {(warn || st.count > 0) && (
              <div className={cx('mt-1 text-xs', warn ? 'text-amber-700' : 'text-slate-500')}>{warn || `On ${baseNames(st) || 'the roof'} · INV-${st.inverter}`}</div>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <button type="button" title="Start a new string, then tap its panels" onClick={newString} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Plus className="h-4 w-4" /> {picked.length ? 'New string' : 'Make my own strings'}
        </button>
        {picked.length > 0 && (
          <button type="button" title="Forget the picked strings and string everything automatically" onClick={clearStrings} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Undo2 className="h-4 w-4" /> Back to automatic
          </button>
        )}
      </div>
    </div>
  );
}

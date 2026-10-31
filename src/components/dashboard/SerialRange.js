'use client';

// Serial numbers for a whole lot without typing each one: the fixed part, the first and last number, the digits to
// pad to and an optional ending. Nothing is guessed from a typed serial — the user says what stays and what counts.
import { ListPlus, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, FormField, Input, cx } from '../kit';

export const MAX_SERIALS = 2000; // the server accepts up to this many in one receipt

/**
 * The serial numbers a range describes. `from` / `to` are the typed numbers (their leading zeros set the padding
 * unless `digits` says otherwise). Returns { list, count, error } — `error` explains an empty list.
 */
export function buildSerialRange({ prefix = '', from = '', to = '', digits = '', suffix = '' }) {
  const a = String(from).trim();
  const b = String(to).trim();
  if (!a && !b) return { list: [], count: 0, error: '' };
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return { list: [], count: 0, error: 'From and To must be whole numbers' };
  const start = Number(a);
  const end = Number(b);
  if (end < start) return { list: [], count: 0, error: 'To must not be smaller than From' };
  const count = end - start + 1;
  if (count > MAX_SERIALS) return { list: [], count, error: `That is ${count} numbers; up to ${MAX_SERIALS} can be received at once` };
  const width = digits !== '' && Number(digits) > 0 ? Math.min(12, Number(digits)) : Math.max(a.length, b.length);
  const list = Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(width, '0')}${suffix}`);
  return { list, count, error: '' };
}

/**
 * A small panel under the serial-number box. `existing` is what the box already holds; `onAdd(list)` appends the
 * generated numbers (ones already in the box are skipped), `onReplace(list)` swaps the box's contents for them.
 */
export default function SerialRange({ existing = [], onAdd, onReplace, unit = 'Piece' }) {
  const [open, setOpen] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [digits, setDigits] = useState('');
  const [suffix, setSuffix] = useState('');
  const range = useMemo(() => buildSerialRange({ prefix, from, to, digits, suffix }), [prefix, from, to, digits, suffix]);
  const have = useMemo(() => new Set(existing.map((s) => s.toLowerCase())), [existing]);
  const fresh = useMemo(() => range.list.filter((s) => !have.has(s.toLowerCase())), [range.list, have]);
  const overflow = existing.length + fresh.length > MAX_SERIALS;
  const width = digits !== '' && Number(digits) > 0 ? Number(digits) : Math.max(String(from).trim().length, String(to).trim().length);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand-ink hover:underline">
        <Wand2 className="h-3.5 w-3.5" />Generate a range of serial numbers instead of typing them
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-xl border border-brand/20 bg-brand-soft/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink"><Wand2 className="h-3.5 w-3.5" />Generate a range</div>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-800">Hide</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1fr)]">
        <FormField label="Fixed part (before the number)" hint="Stays the same on every serial">
          <Input value={prefix} onValue={setPrefix} placeholder="WSMD540-" className="font-mono text-[13px]" maxLength={60} />
        </FormField>
        <FormField label="From" hint="First number">
          <Input inputMode="numeric" value={from} onValue={(v) => setFrom(v.replace(/\D/g, ''))} placeholder="0001" className="font-mono text-[13px]" maxLength={12} />
        </FormField>
        <FormField label="To" hint="Last number">
          <Input inputMode="numeric" value={to} onValue={(v) => setTo(v.replace(/\D/g, ''))} placeholder="0120" className="font-mono text-[13px]" maxLength={12} />
        </FormField>
        <FormField label="Digits" hint="Padded with zeros">
          <Input inputMode="numeric" value={digits} onValue={(v) => setDigits(v.replace(/\D/g, '').slice(0, 2))} placeholder={String(width || 4)} className="font-mono text-[13px]" />
        </FormField>
        <FormField label="Ending" optional hint="After the number">
          <Input value={suffix} onValue={setSuffix} placeholder="-A" className="font-mono text-[13px]" maxLength={20} />
        </FormField>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={cx('min-w-0 font-mono text-xs', range.error ? 'font-sans text-red-600' : 'text-slate-700')}>
          {range.error ? range.error : range.count ? (
            <>
              {range.list[0]}{range.count > 2 && <span className="text-slate-400"> … </span>}{range.count > 1 && range.list.at(-1)}
              <span className="ml-2 font-sans text-slate-500">· {range.count} {unit}{fresh.length < range.count ? ` (${range.count - fresh.length} already in the list)` : ''}</span>
            </>
          ) : <span className="font-sans text-slate-500">Type the first and last number to see the serials.</span>}
        </p>
        <div className="flex shrink-0 gap-2">
          {existing.length > 0 && range.count > 0 && !range.error && (
            <Button size="sm" variant="ghost" disabled={range.count > MAX_SERIALS} onClick={() => onReplace(range.list)}>Replace the list</Button>
          )}
          <Button size="sm" variant="primary" icon={ListPlus} disabled={!fresh.length || Boolean(range.error) || overflow} onClick={() => onAdd(fresh)}>
            {overflow ? `Too many (max ${MAX_SERIALS})` : `Add ${fresh.length || ''} to the list`}
          </Button>
        </div>
      </div>
    </div>
  );
}

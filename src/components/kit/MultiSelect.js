'use client';

// A dropdown that picks several options: the chosen ones show as chips in the field (✕ removes one), the list has a
// checkbox per option and a search box once it is long. The list is drawn in a portal so a scrolling modal can't clip it.
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

const SEARCH_FROM = 8; // options before the list gets a search box
const LIST_HEIGHT = 280;

/** `options`: [{ value, label }]; `value`: the chosen values; `onValue(values)` gets them in the options' order. */
export function MultiSelect({ options, value = [], onValue, placeholder = 'Choose…', searchPlaceholder = 'Search…', emptyText = 'Nothing to choose from', disabled, className, 'aria-label': ariaLabel }) {
  const [pos, setPos] = useState(null); // where the open list sits, in viewport pixels
  const [query, setQuery] = useState('');
  const field = useRef(null);
  const toggleButton = useRef(null);
  const list = useRef(null);
  const listId = useId();
  const chosen = new Set(value.map(String));
  const picked = options.filter((o) => chosen.has(String(o.value)));
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  const close = (refocus) => {
    setPos(null);
    setQuery('');
    if (refocus) toggleButton.current?.focus();
  };
  const open = () => {
    if (disabled) return;
    const r = field.current.getBoundingClientRect();
    const height = Math.min(LIST_HEIGHT, options.length * 36 + (options.length >= SEARCH_FROM ? 52 : 0) + 48);
    const up = window.innerHeight - r.bottom < height + 12 && r.top > height + 12;
    setPos({ left: r.left, width: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };
  const set = (values) => onValue(options.map((o) => String(o.value)).filter((v) => values.has(v)));
  const toggle = (v) => {
    const next = new Set(chosen);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    set(next);
  };

  useEffect(() => {
    if (!pos) return undefined;
    const inside = (t) => field.current?.contains(t) || list.current?.contains(t);
    const onPointer = (e) => !inside(e.target) && close();
    // capture + stop: Esc closes only this list, not the dialog it sits in
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.current?.contains(document.activeElement)) {
        e.preventDefault();
        const els = [...list.current.querySelectorAll('input')];
        const i = els.indexOf(document.activeElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    const onScroll = (e) => !list.current?.contains(e.target) && close(); // the list is fixed: it would drift from the field
    const onResize = () => close();
    (list.current?.querySelector('input[type=search]') || list.current?.querySelector('input'))?.focus();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(pos)]);

  return (
    <>
      <div
        ref={field}
        onClick={(e) => {
          // inside a <label> (FormField) a click here would also be passed on to the first button in it, e.g. a chip's ✕
          e.preventDefault();
          if (!e.target.closest('[data-remove]')) (pos ? close() : open());
        }}
        className={cx(
          'flex min-h-10 w-full items-center gap-1.5 rounded-lg border bg-white py-1.5 pr-2 pl-2 text-sm shadow-sm transition',
          pos ? 'border-brand ring-4 ring-brand-muted/60' : 'border-slate-300 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-muted/60',
          disabled ? 'cursor-not-allowed bg-slate-50 text-slate-500' : 'cursor-pointer',
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {/* first in the markup (shown last) so a click on the field's <label> opens the list instead of hitting a chip's ✕ */}
          <button
            ref={toggleButton}
            type="button"
            disabled={disabled}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={Boolean(pos)}
            aria-controls={pos ? listId : undefined}
            onKeyDown={(e) => { if (e.key === 'ArrowDown' && !pos) { e.preventDefault(); open(); } }}
            style={{ outline: 'none' }} // the field's ring shows the focus
            className="order-last min-w-[4rem] flex-1 truncate px-1 py-0.5 text-left text-slate-400 outline-none disabled:cursor-not-allowed"
          >
            {picked.length ? '' : placeholder}
          </button>
          {picked.map((o) => (
            <span key={o.value} className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-brand/10 py-0.5 pr-0.5 pl-2 text-[13px] font-medium text-brand-ink">
              <span className="truncate">{o.label}</span>
              {!disabled && (
                <button type="button" data-remove aria-label={`Remove ${o.label}`} onClick={() => toggle(String(o.value))} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-brand/15">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {picked.length > 1 && !disabled && (
          <button type="button" data-remove aria-label="Clear all" title="Clear all" onClick={() => set(new Set())} className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-400 transition-transform', pos && 'rotate-180')} />
      </div>
      {pos && createPortal(
        <div ref={list} id={listId} role="listbox" aria-multiselectable="true" aria-label={ariaLabel} style={{ ...pos, maxHeight: LIST_HEIGHT }} className="fixed z-[60] flex animate-pop flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl">
          {options.length >= SEARCH_FROM && (
            <div className="border-b border-slate-100 p-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 focus-within:border-brand">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} style={{ outline: 'none' }} className="h-8 min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400" />
              </label>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {!options.length && <p className="px-3.5 py-2.5 text-sm text-slate-500">{emptyText}</p>}
            {options.length > 0 && !shown.length && <p className="px-3.5 py-2.5 text-sm text-slate-500">No match for “{query.trim()}”</p>}
            {shown.map((o) => {
              const on = chosen.has(String(o.value));
              return (
                <label key={o.value} role="option" aria-selected={on} className={cx('flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-slate-50 has-[:focus-visible]:bg-slate-50', on ? 'font-medium text-slate-900' : 'text-slate-700')}>
                  <input type="checkbox" checked={on} onChange={() => toggle(String(o.value))} className="peer sr-only" />
                  <span aria-hidden className={cx('grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors', on ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white')}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 truncate">{o.label}</span>
                </label>
              );
            })}
          </div>
          {options.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2 text-xs text-slate-500">
              <span>{picked.length ? `${picked.length} selected` : 'None selected'}</span>
              <span className="flex gap-3">
                {picked.length < options.length && <button type="button" onClick={() => set(new Set(options.map((o) => String(o.value))))} className="font-medium text-brand-ink hover:underline">Select all</button>}
                {picked.length > 0 && <button type="button" onClick={() => set(new Set())} className="font-medium text-slate-600 hover:underline">Clear</button>}
              </span>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

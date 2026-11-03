'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BellRing, ChevronDown } from 'lucide-react';
import { buttonClass, cx } from '@/components/kit';

export function AttentionItemRow({ item, variant = 'org', onActivate }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => {
        item.onClick();
        onActivate?.();
      }}
      className={cx(
        'group flex w-full items-center gap-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 text-left transition-all',
        'hover:border-slate-300 hover:bg-slate-50/90 hover:shadow-sm',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        item.urgent && 'border-l-[3px] border-l-amber-500 pl-[calc(1rem-3px)]',
      )}
    >
      {Icon && (
        <span
          className={cx(
            'grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
            item.urgent
              ? 'bg-amber-50 text-amber-700 ring-amber-100'
              : 'bg-slate-50 text-slate-600 ring-slate-100',
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 pr-1">
        <span className="block text-[15px] font-semibold leading-snug text-slate-900 group-hover:text-brand">
          {item.label}
        </span>
        {item.detail ? (
          <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">{item.detail}</span>
        ) : null}
      </span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:bg-brand-soft group-hover:text-brand">
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}

/** Header control — full list opens in a dropdown panel. */
export default function AttentionDropdown({ items, variant = 'org', panelHint }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  if (!items.length) return null;

  const urgentCount = items.filter((i) => i.urgent).length;
  const hint = panelHint ?? (variant === 'branch' ? 'Choose an item to open the right page in this branch.' : 'Choose an item to open the branch where it matters most.');

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto sm:shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass({
          variant: 'secondary',
          size: 'md',
          className: cx(
            'w-full gap-2.5 px-3.5 sm:w-auto sm:min-w-[14rem]',
            '!justify-start',
            open && 'ring-2 ring-brand/20',
            urgentCount > 0 && !open && 'bg-amber-50/80 text-amber-950 ring-amber-200/80 hover:bg-amber-50',
          ),
        })}
      >
        <BellRing className={cx('h-4 w-4 shrink-0', urgentCount > 0 ? 'text-amber-600' : 'text-slate-500')} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left font-semibold">Needs attention</span>
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
            urgentCount > 0 ? 'bg-amber-200/90 text-amber-900' : 'bg-slate-100 text-slate-600',
          )}
        >
          {items.length}
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Needs attention"
          className="absolute right-0 z-50 mt-2.5 w-[min(calc(100vw-1.5rem),22rem)] sm:w-[min(calc(100vw-2rem),28rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.04]"
        >
          <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Needs attention</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{hint}</p>
          </div>
          <ul className="max-h-[min(65vh,22rem)] space-y-2.5 overflow-y-auto p-4">
            {items.map((item) => (
              <li key={item.key}>
                <AttentionItemRow item={item} variant={variant} onActivate={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

'use client';

import { cx } from '../ui';

export function FormPage({ icon: Icon, title, children, wide }) {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className={cx('mx-auto px-5 pb-16 pt-8', wide ? 'max-w-4xl' : 'max-w-[660px]')}>
        <h1 className="flex items-center gap-2.5 border-b border-slate-200 pb-4 text-[22px] font-bold tracking-tight">
          {Icon && <Icon className="h-6 w-6" />} {title}
        </h1>
        <div className="mt-6 space-y-6">{children}</div>
      </div>
    </div>
  );
}

export function Label({ children }) {
  return <div className="mb-2 text-[15px] font-medium text-slate-700">{children}</div>;
}

export const inputCls = 'h-[52px] w-full rounded-md border border-slate-300 bg-white px-4 text-[16px] shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-muted';

export function Num({ label, value, onChange, step = 0.1, min = 0, max = 999, suffix }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative">
        <input type="number" className={inputCls} value={value} step={step} min={min} max={max} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} />
        {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

export function Choice({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={cx('h-12 rounded-md border text-sm font-medium', value === o.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Round floating tool button used on editor screens. */
export function RoundBtn({ icon: Icon, label, active, danger, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className={cx('group relative grid h-11 w-11 place-items-center rounded-full shadow-md transition disabled:opacity-40', active ? 'bg-brand text-brand-fg' : danger ? 'bg-white text-red-500 hover:bg-red-50' : 'bg-white text-slate-700 hover:bg-slate-100')}
    >
      <Icon className="h-[18px] w-[18px]" />
      <span className="pointer-events-none absolute left-full z-10 ml-2 hidden whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">{label}</span>
    </button>
  );
}

export function Card({ children, className }) {
  return (
    <div onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} className={cx('rounded-lg bg-white p-4 shadow-xl ring-1 ring-black/5', className)}>
      {children}
    </div>
  );
}

export function Hint({ children }) {
  return <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-slate-900/85 px-4 py-2 text-xs text-white shadow-lg">{children}</div>;
}

export function MiniNum({ label, value, onChange, step = 1, min = 0, max = 999, suffix }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-right text-sm outline-none focus:border-brand" />
        <span className="w-6 text-xs text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

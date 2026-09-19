'use client';

// UI kit for the SaaS screens (admin console, company workspace, sign-in). Tailwind + brand tokens.
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { create } from 'zustand';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

/* ───────────── Buttons ───────────── */

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-brand-fg shadow-sm hover:bg-brand-600 disabled:opacity-50',
  secondary: 'bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-50',
  dangerGhost: 'text-red-600 hover:bg-red-50 disabled:text-red-300',
};
const BUTTON_SIZES = { sm: 'h-8 gap-1.5 px-3 text-[13px]', md: 'h-10 gap-2 px-4 text-sm', lg: 'h-12 gap-2 px-6 text-[15px]' };

export const buttonClass = ({ variant = 'secondary', size = 'md', className } = {}) =>
  cx('inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed', BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);

export function Button({ variant, size, className, icon: Icon, loading, children, type = 'button', disabled, ...props }) {
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass({ variant, size, className })} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, tone = 'default', className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors', tone === 'danger' ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-700', className)}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ───────────── Form controls ───────────── */

const CONTROL = 'block rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand-muted/60 disabled:bg-slate-50 disabled:text-slate-500';

export function FormField({ label, hint, error, optional, className, children }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-slate-700">
          {label}
          {optional && <span className="text-xs font-normal text-slate-400">Optional</span>}
        </span>
      )}
      {children}
      {error ? <span className="mt-1.5 block text-xs text-red-600">{error}</span> : hint && <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

// full width unless the caller sets a width (two width utilities would fight each other)
const widthOf = (className) => (/(^|\s)w-/.test(className || '') ? '' : 'w-full');

export function Input({ className, onValue, onChange, ...props }) {
  return <input className={cx(CONTROL, widthOf(className), 'h-10', className)} onChange={(e) => (onValue ? onValue(e.target.value) : onChange?.(e))} {...props} />;
}

export function Textarea({ className, onValue, onChange, rows = 3, ...props }) {
  return <textarea rows={rows} className={cx(CONTROL, widthOf(className), 'py-2.5 leading-relaxed', className)} onChange={(e) => (onValue ? onValue(e.target.value) : onChange?.(e))} {...props} />;
}

export function Select({ className, onValue, onChange, children, ...props }) {
  return (
    <select className={cx(CONTROL, widthOf(className), 'h-10 pr-8', className)} onChange={(e) => (onValue ? onValue(e.target.value) : onChange?.(e))} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-slate-500">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

/* ───────────── Surfaces ───────────── */

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, unit, icon: Icon, hint }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        {Icon && (
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-soft text-brand">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-[28px] leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{value}</span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  brand: 'bg-brand-soft text-brand-ink ring-brand-muted',
};

export function Badge({ tone = 'slate', dot, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', BADGE_TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 36, square, className }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" style={style} className={cx('shrink-0 bg-white object-contain ring-1 ring-slate-200', square ? 'rounded-lg' : 'rounded-full', className)} />;
  return (
    <span style={style} className={cx('grid shrink-0 place-items-center bg-brand-soft font-semibold text-brand-ink', square ? 'rounded-lg' : 'rounded-full', className)}>
      {initials}
    </span>
  );
}

/**
 * A fixed-size frame that shows any image whole and centred, whatever its proportions (wide logo,
 * tall QR code, thin signature). The image is absolutely positioned so it can never push or
 * overflow its box.
 */
export function ImageFrame({ src, alt = '', className, padding = 'p-2', checker }) {
  return (
    <span className={cx('relative block shrink-0 overflow-hidden', checker ? 'bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:14px_14px]' : 'bg-white', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={alt} className={cx('absolute inset-0 h-full w-full object-contain', padding)} />}
    </span>
  );
}

/** Company logo in lists and headers: a wide white chip (logos are rarely square); initials without a logo. */
export function LogoChip({ name, src, className }) {
  if (!src) return <Avatar name={name} square size={36} className={className} />;
  return <ImageFrame src={src} padding="p-1" className={cx('h-9 w-14 rounded-lg ring-1 ring-slate-200', className)} />;
}

export function Spinner({ className }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-slate-400', className)} />;
}

export function LoadingBlock({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="grid h-dvh place-items-center bg-slate-50" role="status" aria-label="Loading">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'error', children, className }) {
  const tones = { error: 'border-red-200 bg-red-50 text-red-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-sky-200 bg-sky-50 text-sky-800', success: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('rounded-lg border px-3.5 py-2.5 text-[13px] leading-snug', tones[tone], className)}>
      {children}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto border-b border-slate-200', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors', value === t.id ? 'border-brand text-brand-ink' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {t.icon && <t.icon className="h-4 w-4" />}
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-slate-100 px-2 py-px text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ───────────── Tables ───────────── */

export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full min-w-[640px] text-left text-sm', className)}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }) => <th className={cx('border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase first:pl-6 last:pr-6', className)}>{children}</th>;
export const Td = ({ children, className }) => <td className={cx('border-b border-slate-100 px-4 py-3.5 align-middle text-slate-700 first:pl-6 last:pr-6', className)}>{children}</td>;
export const Tr = ({ children, className, ...props }) => <tr className={cx('transition-colors last:[&>td]:border-0 hover:bg-slate-50/60', className)} {...props}>{children}</tr>;

/* ───────────── Modal ───────────── */

export function Modal({ open, onClose, title, description, size = 'md', children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input:not([type=hidden]),select,textarea,button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('relative flex max-h-[92dvh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', sizes[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Modal wrapping a form: Enter submits, footer has Cancel + submit. */
export function FormModal({ open, onClose, title, description, size, submitLabel = 'Save', busy, error, onSubmit, onInvalid, children, danger }) {
  const id = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={id} variant={danger ? 'danger' : 'primary'} loading={busy}>{submitLabel}</Button>
        </>
      }
    >
      <form id={id} className="space-y-4" onInvalidCapture={onInvalid} onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        {error && <Alert>{error}</Alert>}
        {children}
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Delete', busy, error }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
        <div className="min-w-0 pt-0.5 text-sm leading-relaxed text-slate-600">
          {children}
          {error && <Alert className="mt-3">{error}</Alert>}
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Toasts ───────────── */

const useToasts = create((set) => ({
  items: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ items: [...s.items.slice(-3), { id, ...t }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.tone === 'error' ? 6000 : 3500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (message) => useToasts.getState().push({ tone: 'success', message }),
  error: (message) => useToasts.getState().push({ tone: 'error', message }),
};

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          {t.tone === 'error' ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
          <p className="min-w-0 flex-1 text-sm text-slate-700">{t.message}</p>
          <IconButton icon={X} label="Dismiss" onClick={() => dismiss(t.id)} className="-mt-1 -mr-2" />
        </div>
      ))}
    </div>
  );
}

/* ───────────── Helpers ───────────── */

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export function timeAgo(d) {
  if (!d) return 'Never';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return formatDate(d);
}

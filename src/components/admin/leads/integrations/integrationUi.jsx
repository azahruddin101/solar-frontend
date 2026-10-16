'use client';

// Shared pieces of the lead integrations (Meta, Google Ads): copy fields, numbered steps, the status pill and icons.
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Badge, cx, toast } from '@/components/kit';

export const copyValue = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    toast.error('Could not copy. Select the text and copy it by hand.');
    return false;
  }
};

/** A value to paste somewhere else, with a big Copy button that confirms in place. */
export function CopyField({ label, value, hint, secret }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyValue(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };
  return (
    <div>
      {label && <p className="mb-1.5 text-[13px] font-medium text-slate-700">{label}</p>}
      <div className="flex items-stretch gap-2">
        <code className={cx('min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] leading-relaxed break-all text-slate-800', secret && 'tracking-tight')}>{value}</code>
        <button type="button" onClick={copy} className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors', copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-700')}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A numbered step of a setup guide: done steps get a tick, the current one is highlighted. */
export function Step({ n, title, state = 'todo', children, last }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span className={cx('absolute top-9 bottom-1 left-[15px] w-px', state === 'done' ? 'bg-emerald-300' : 'bg-slate-200')} aria-hidden />}
      <span className={cx('relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold', state === 'done' ? 'bg-emerald-500 text-white' : state === 'current' ? 'bg-brand text-white ring-4 ring-brand-soft' : 'bg-slate-100 text-slate-500')}>
        {state === 'done' ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className={cx('text-[15px] font-semibold', state === 'todo' ? 'text-slate-500' : 'text-slate-900')}>{title}</h3>
        {children && <div className="mt-2 text-sm text-slate-600">{children}</div>}
      </div>
    </li>
  );
}

/** Connected / waiting / off, in words. */
export function StatusPill({ tone, children }) {
  return <Badge tone={tone} dot>{children}</Badge>;
}

// Pieces of the Meta screen (same layout as IIAE)
// A value the admin has to paste into an external app, with a copy button
export const CopyRow = ({ label, value }) => (
  <div>
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700">{value}</code>
      <button
        type="button"
        onClick={async () => { if (await copyValue(value)) toast.success('Copied'); }}
        className="btn-outline h-8 shrink-0 px-2.5 text-[11px]"
      >
        <Copy className="h-3.5 w-3.5" /> Copy
      </button>
    </div>
  </div>
);

export const Panel = ({ title, action, children, footer, className = '', onSubmit }) => {
  const Tag = onSubmit ? 'form' : 'section';
  return (
    <Tag onSubmit={onSubmit} className={`glass-card flex h-full min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      {footer ? <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-2.5">{footer}</div> : null}
    </Tag>
  );
};

export const MetricCard = ({ label, value, detail, action, icon: Icon, tone }) => (
  <div className="glass-card flex min-w-0 items-center justify-between gap-3 px-4 py-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {action}
      </div>
      <p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-slate-900">{value}</p>
      <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{detail}</p>
    </div>
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
      <Icon className="h-5 w-5" />
    </div>
  </div>
);

export const SpinnerPanel = () => (
  <div className="flex h-[calc(100vh-5.5rem)] items-center justify-center md:h-[calc(100vh-3rem)]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
);

export const FacebookIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1877F2" />
    <path fill="#fff" d="M13.6 12.7h2.1l.3-2.3h-2.4V9.1c0-.7.2-1.1 1.2-1.1h1.3V6c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.1-3.2 3.2v1.3H8.7v2.3h2.3V19h2.6v-6.3z" />
  </svg>
);

export const GoogleAdsIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#FBBC04" d="M4.2 16.8 9.6 7.4a3.2 3.2 0 0 1 5.5 3.2L9.7 20a3.2 3.2 0 0 1-5.5-3.2z" />
    <path fill="#4285F4" d="M14.8 8.2 19.6 16.6A3.2 3.2 0 0 1 14.1 20l-4.8-8.4a3.2 3.2 0 0 1 5.5-3.4z" />
    <circle cx="7.2" cy="17.6" r="2.5" fill="#34A853" />
  </svg>
);

export const formatWhen = (value) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

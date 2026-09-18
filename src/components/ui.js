'use client';

// Small shared UI primitives (Tailwind).

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

export function Section({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cx('border-b border-slate-200 px-5 py-4', className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
            {Icon && <Icon className="h-4 w-4 text-amber-500" />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = 'secondary', size = 'md', className, icon: Icon, children, ...props }) {
  const variants = {
    primary: 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-sm disabled:bg-amber-200 disabled:text-slate-500',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 disabled:text-slate-400',
    ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
    danger: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:text-red-300',
  };
  const sizes = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-sm gap-2' };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, value, children, className }) {
  return (
    <label className={cx('block', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        {value !== undefined && <span className="font-mono text-xs text-slate-500">{value}</span>}
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </label>
  );
}

export function Slider({ min, max, step = 1, value, onChange, disabled }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer accent-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, suffix, className }) {
  return (
    <div className={cx('flex h-9 items-center rounded-lg bg-white ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-amber-400', className)}>
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = e.target.value === '' ? 0 : Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="h-full w-full min-w-0 rounded-lg bg-transparent px-3 text-sm outline-none"
      />
      {suffix && <span className="pr-3 text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-amber-400"
    />
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="grid gap-1 rounded-lg bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cx(
            'h-8 rounded-md px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, tone = 'default', className }) {
  return (
    <div className={cx('rounded-xl px-3 py-2.5', tone === 'accent' ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50 ring-1 ring-slate-200', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'info', icon: Icon, children, className }) {
  const tones = {
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  };
  return (
    <div className={cx('flex gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug ring-1', tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Kbd({ children }) {
  return <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[10px] text-slate-600">{children}</kbd>;
}

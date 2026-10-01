'use client';

// UI kit for the SaaS screens (admin console, company workspace, sign-in). Tailwind + brand tokens.
import { AlertTriangle, Camera, Download, CheckCircle2, CircleAlert, EllipsisVertical, Eye, EyeOff, ImageIcon, Loader2, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openFile, signedFileUrl } from '@/lib/files';
import { create } from 'zustand';
import RichTextEditor from './RichTextEditor';

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

/** Live camera capture. Uses getUserMedia (works on desktop webcams too); falls back to the native camera input where unavailable. */
export function CameraButton({ onFile, disabled, size = 'sm', label = 'Take photo', className }) {
  const fallbackRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const close = () => { stop(); setOpen(false); setReady(false); setError(''); };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { fallbackRef.current?.click(); return; }
    setError('');
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      // the modal mounts the <video> on the next render
      requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      });
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser and try again.' : 'No camera could be opened on this device.');
    }
  };

  useEffect(() => stop, []);

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onFile(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      close();
    }, 'image/jpeg', 0.92);
  };

  return (
    <>
      <input ref={fallbackRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
      <Button type="button" size={size} icon={Camera} disabled={disabled} className={className} onClick={start}>{label}</Button>
      <Modal open={open} onClose={close} title="Take photo" footer={
        <>
          <Button type="button" onClick={close}>Cancel</Button>
          <Button type="button" variant="primary" icon={Camera} disabled={!ready || !!error} onClick={snap}>Capture</Button>
        </>
      }>
        {error ? <Alert>{error}</Alert> : (
          <video ref={videoRef} playsInline muted onLoadedData={() => setReady(true)} className="w-full rounded-lg bg-black" />
        )}
      </Modal>
    </>
  );
}

/* ───────────── Image lightbox ───────────── */

const useLightbox = create((set) => ({
  item: null,
  open: (src, alt = '') => set({ item: { src, alt } }),
  close: () => set({ item: null }),
}));

/** Open a picture in the pop-up from code (e.g. a link to an uploaded image). */
export const openImage = (src, alt = '') => useLightbox.getState().open(src, alt);

/** Open a stored (protected) file: images in the pop-up viewer, anything else in a new tab. */
export function openStoredFile(url, { mimetype = '', name = '' } = {}) {
  if (mimetype.startsWith('image/')) signedFileUrl(url).then((signed) => openImage(signed, name)).catch(() => {});
  else openFile(url);
}

/** An image that opens full-size in a pop-up when clicked. Use it for any picture a person may want to see properly. */
export function ZoomImage({ src, alt = '', className, ...props }) {
  const open = () => useLightbox.getState().open(src, alt);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      role="button"
      tabIndex={0}
      title="Click to enlarge"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); open(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className={cx('cursor-zoom-in', className)}
      {...props}
    />
  );
}

/** Mounted once (root layout). Esc, the ✕ button or a click outside the picture closes it. */
export function LightboxHost() {
  const { item, close } = useLightbox();
  useEffect(() => {
    if (!item) return undefined;
    // capture phase + stop: Esc closes only the picture, not the dialog behind it
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, close]);
  if (!item || typeof document === 'undefined') return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.alt || 'Image preview'} className="fixed inset-0 z-[100] flex animate-fade flex-col bg-slate-950/85 backdrop-blur-sm" onClick={close}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm text-white/80">{item.alt}</span>
        <div className="flex items-center gap-1">
          {!item.src.startsWith('data:') && (
            <a href={item.src} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"><Download className="h-5 w-5" /></a>
          )}
          <button type="button" autoFocus aria-label="Close" title="Close (Esc)" onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        {/* clicking the picture itself keeps it open; the dark area around it closes */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt={item.alt} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full animate-pop rounded-lg object-contain shadow-2xl" />
      </div>
    </div>,
    document.body,
  );
}

/** Two ways to supply an image: pick from the gallery/files, or shoot one with the camera now. */
export function ImageSourceButtons({ onFiles, accept = 'image/png,image/jpeg,image/webp', multiple, disabled, size = 'sm', galleryLabel = 'Choose from gallery', cameraLabel = 'Take photo', className }) {
  const galleryRef = useRef(null);
  const handle = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) onFiles(multiple ? files : files[0]);
  };
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <input ref={galleryRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={handle} />
      <Button type="button" size={size} icon={ImageIcon} disabled={disabled} onClick={() => galleryRef.current?.click()}>{galleryLabel}</Button>
      <CameraButton size={size} disabled={disabled} label={cameraLabel} onFile={(f) => onFiles(multiple ? [f] : f)} />
    </div>
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

/**
 * Three-dot menu for a table row: `items` are {key, icon, label, tone?, disabled?, onClick | href}; falsy entries are skipped.
 * The list is drawn in a portal, so a scrolling table cannot clip it, and opens upwards when there is no room below.
 */
export function RowMenu({ items, label = 'Actions' }) {
  const [pos, setPos] = useState(null); // where the open list sits, in viewport pixels
  const button = useRef(null);
  const list = useRef(null);
  const entries = items.filter(Boolean);
  const close = () => setPos(null);

  const toggle = () => {
    if (pos) return close();
    const r = button.current.getBoundingClientRect();
    const height = entries.length * 38 + 10;
    const up = window.innerHeight - r.bottom < height + 12 && r.top > height + 12;
    return setPos({ right: Math.max(8, window.innerWidth - r.right), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  };

  useEffect(() => {
    if (!pos) return undefined;
    const onPointer = (e) => !button.current?.contains(e.target) && !list.current?.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        close();
        button.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = [...list.current.querySelectorAll('a,button:not(:disabled)')];
        const i = els.indexOf(document.activeElement);
        els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
      }
    };
    list.current?.querySelector('a,button:not(:disabled)')?.focus();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true); // the list is fixed: it would drift from its row
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  return (
    <>
      <button ref={button} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={toggle} className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-slate-100 hover:text-slate-700', pos ? 'bg-slate-100 text-slate-700' : 'text-slate-500')}>
        <EllipsisVertical className="h-4 w-4" />
      </button>
      {pos && createPortal(
        <div ref={list} role="menu" aria-label={label} style={pos} className="fixed z-50 min-w-52 animate-pop overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
          {entries.map(({ key, icon: Icon, label: text, tone, disabled, onClick, href }) => {
            const className = cx('flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm font-medium outline-none disabled:cursor-not-allowed disabled:opacity-40', tone === 'danger' ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50' : 'text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50');
            const body = <>{Icon && <Icon className={cx('h-4 w-4 shrink-0', tone === 'danger' ? 'text-red-500' : 'text-slate-400')} />}{text}</>;
            if (href && !disabled) return <Link key={key || text} href={href} role="menuitem" onClick={close} className={className}>{body}</Link>;
            return (
              <button
                key={key || text}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  close();
                  onClick?.();
                }}
                className={className}
              >
                {body}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
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

/** Phone number: only digits, one leading +, spaces, dashes and brackets can be typed or pasted. */
/**
 * A number field you can clear and retype. It keeps what is typed while the field is focused, tells the parent the
 * number as soon as it is valid (an empty box counts as 0 when 0 is allowed), and only applies `min` when you leave —
 * so clearing a "1" to type "5" no longer snaps back to 1, and there is no stray leading 0.
 */
export function NumField({ value, onValue, min, max, ...props }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value === undefined || value === null || Number.isNaN(value) ? '' : value);
  return (
    <input
      type="number"
      min={min}
      max={max}
      {...props}
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === '') return (min ?? 0) <= 0 ? onValue(0) : undefined;
        let n = Number(raw);
        if (!Number.isFinite(n)) return undefined;
        if (max != null) n = Math.min(max, n);
        if (min != null && min >= 0 && n < 0) return undefined;
        return onValue(n);
      }}
      onBlur={(e) => {
        setDraft(null);
        if (min != null && Number(value) < min) onValue(min);
        const step = props.step;
        if (step === '0.01' || step === 0.01) {
          const n = Number(value);
          if (Number.isFinite(n)) {
            const r = Math.round(n * 100) / 100;
            if (r !== n) onValue(r);
          }
        }
        props.onBlur?.(e);
      }}
    />
  );
}

export function cleanPhoneInput(v) {
  let d = String(v).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2); // pasted +91 98765 43210
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}
export function PhoneInput({ onValue, ...props }) {
  return <Input type="tel" inputMode="numeric" autoComplete="tel" placeholder="10-digit mobile" onValue={(v) => onValue?.(cleanPhoneInput(v))} {...props} />;
}

/** Names: `person` allows letters, spaces . ' - ; `business` also digits and & , ( ) / + . Anything else is dropped as it is typed. */
export function cleanName(v, kind = 'person') {
  const drop = kind === 'business' ? /[^\p{L}\p{N}\p{M}\s.,&'’()/+-]/gu : /[^\p{L}\p{M}\s.'’-]/gu;
  const start = kind === 'business' ? /^[^\p{L}\p{N}]+/u : /^[^\p{L}]+/u;
  return String(v).replace(drop, '').replace(start, '').replace(/\s{2,}/g, ' ');
}
export function NameInput({ kind = 'person', onValue, ...props }) {
  return <Input autoComplete="off" onValue={(v) => onValue?.(cleanName(v, kind))} {...props} />;
}

/** Password field with a show / hide button. `defaultVisible` for passwords someone is setting for another person. */
export function PasswordInput({ className, defaultVisible = false, disabled, ...props }) {
  const [visible, setVisible] = useState(defaultVisible);
  return (
    <span className={cx('relative block', widthOf(className), /(^|\s)(min-w-0|flex-1)/.test(className || '') && 'min-w-0 flex-1')}>
      <Input {...props} disabled={disabled} type={visible ? 'text' : 'password'} className={cx('w-full pr-10', className)} />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
        // keep the caret in the field while toggling
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-slate-400 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  );
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

export function Avatar({ name, src, size = 36, square, className, zoom }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && zoom) return <ZoomImage src={src} alt={name || 'Photo'} style={style} className={cx('shrink-0 bg-white object-cover ring-1 ring-slate-200', square ? 'rounded-lg' : 'rounded-full', className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" style={style} className={cx('shrink-0 bg-white object-cover ring-1 ring-slate-200', square ? 'rounded-lg' : 'rounded-full', className)} />;
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

/** Footer for a paginated table backed by `usePagedResource` — shown only while more rows remain. */
export function LoadMoreRow({ hasMore, loadingMore, onClick, loaded, total }) {
  if (!hasMore) return null;
  return (
    <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-6 py-4">
      <Button size="sm" variant="secondary" loading={loadingMore} onClick={onClick}>Load more</Button>
      <span className="text-xs text-slate-400">{loaded} of {total}</span>
    </div>
  );
}

/** Prev / next footer for `usePaginatedResource` or client-sliced lists. */
export function TablePagination({ page, totalPages, total, pageSize, onPageChange, className }) {
  if (total <= 0) return null;
  const pages = Math.max(1, totalPages || Math.ceil(total / pageSize) || 1);
  if (pages <= 1 && total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-3', className)}>
      <span className="text-xs text-slate-500">
        Showing <b className="font-medium text-slate-700">{start}–{end}</b> of <b className="font-medium text-slate-700">{total}</b>
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <span className="min-w-[5.5rem] text-center text-xs text-slate-600">Page {page} of {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
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

/** A horizontal step indicator for a multi-step form/modal. `current` is the 0-based index of the active step. */
/** A slim progress track with the step names as labels — no numbered circles. */
export function Stepper({ steps, current }) {
  return (
    <div role="list" aria-label="Steps">
      <div className="flex items-center gap-1.5">
        {steps.map((label, i) => (
          <div key={label} className={cx('h-1 flex-1 rounded-full transition-colors', i <= current ? 'bg-brand' : 'bg-slate-200')} />
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        {steps.map((label, i) => (
          <span key={label} className={cx('flex items-center gap-1 text-[12px] font-medium', i === current ? 'text-brand-ink' : i < current ? 'text-slate-500' : 'text-slate-400')}>
            {i < current && <CheckCircle2 className="h-3.5 w-3.5" />}
            {label}
          </span>
        ))}
      </div>
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
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', '2xl': 'max-w-6xl' };
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

/** Modal wrapping a form: Enter submits, footer has Cancel + submit. A failed save (`error`) opens the error dialog. */
/** `noValidate`: skip the browser's own checks (the form validates itself with zod and shows field messages). */
export function FormModal({ open, onClose, title, description, size, submitLabel = 'Save', busy, error, onSubmit, onInvalid, children, danger, noValidate }) {
  const id = useId();
  useErrorDialog(error);
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
      <form id={id} noValidate={noValidate} className="space-y-4" onInvalidCapture={onInvalid} onSubmit={(e) => { e.preventDefault(); onSubmit?.(e); }}>
        {children}
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Delete', busy, error }) {
  useErrorDialog(error);
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
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Error dialog ───────────── */

const useErrors = create((set) => ({ current: null, show: (current) => set({ current }), close: () => set({ current: null }) }));

/**
 * Show what went wrong in a dialog the user has to acknowledge — for failed form saves.
 * Accepts an Error or a message; several problems come one per line (validation) and are listed.
 */
export function showError(error, title) {
  const message = String(error?.message ?? error ?? '').trim() || 'Something went wrong. Please try again.';
  const offline = error?.status === 0;
  useErrors.getState().show({ title: title || (offline ? 'No connection' : error?.status >= 500 ? 'Something went wrong on our side' : 'That didn’t work'), lines: message.split('\n').filter(Boolean) });
}

/** For forms that keep their error in state: opens the dialog whenever a new error arrives. */
export function useErrorDialog(error) {
  useEffect(() => {
    if (error) showError(error);
  }, [error]);
}

/** Rendered once per layout, next to the toasts. Sits above any open form modal. */
function ErrorDialog() {
  const { current, close } = useErrors();
  const ok = useRef(null);
  useEffect(() => {
    if (!current) return undefined;
    const prev = document.activeElement;
    ok.current?.focus();
    // capture: Escape / Enter close this dialog only, not the form modal underneath
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [current, close]);
  if (!current) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade bg-slate-950/50 backdrop-blur-[2px]" onClick={close} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title" aria-describedby="error-dialog-body" className="relative w-full max-w-md animate-pop overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex gap-4 px-6 pt-6 pb-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><CircleAlert className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="error-dialog-title" className="text-base font-semibold text-slate-900">{current.title}</h2>
            <div id="error-dialog-body" className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {current.lines.length === 1 ? <p className="break-words">{current.lines[0]}</p> : (
                <>
                  <p>Please fix the following and try again:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">{current.lines.map((l) => <li key={l} className="break-words">{l}</li>)}</ul>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/70 px-6 py-3.5">
          <Button ref={ok} variant="primary" onClick={close}>OK</Button>
        </div>
      </div>
    </div>
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
    <>
      <ErrorDialog />
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex animate-slide-in items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            {t.tone === 'error' ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
            <p className="min-w-0 flex-1 text-sm text-slate-700">{t.message}</p>
            <IconButton icon={X} label="Dismiss" onClick={() => dismiss(t.id)} className="-mt-1 -mr-2" />
          </div>
        ))}
      </div>
    </>
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

export { RichTextEditor };

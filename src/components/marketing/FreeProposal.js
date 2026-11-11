'use client';

// The free proposal maker (public, no sign-in): a solar company types its own details, its client, the system,
// the price lines and the terms, picks a design and downloads a proposal PDF that looks like a workspace one.
// Nothing is pre-filled from a catalog or a package, and nothing of a workspace is touched: the proposal is saved
// on its own (POST/PUT /api/public/free-proposals) with the visitor's device and where they were, and the platform
// admin sees it as a lead (Admin console → Free proposals). The page says so before anything is saved.
//
// A draft is kept in this browser while typing, so a refresh loses nothing.
import { ArrowLeft, ArrowRight, Building2, Check, Download, FileText, ImagePlus, Loader2, LocateFixed, Palette, Plus, ReceiptText, ScrollText, ShieldCheck, Sun, Trash2, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { COVER_STYLES } from '@/lib/coverStyles';
import { CURRENCIES, formatMoney } from '@/lib/energy';
import { lineAmount, proposalSavings, proposalTotals } from '@/lib/freeProposalCalc';
import { RichTextEditor, cx } from '../kit';
import { BrandMark, PRODUCT_NAME } from '../layout/Brand';

const PAGE_THEME = { '--brand': '#1D4ED8', '--brand-fg': '#ffffff', '--accent': '#F5B82E', '--accent-fg': '#1c1917' };
const DRAFT_KEY = 'solardesy.freeProposal.v2';

const STYLES = `
@keyframes fp-in { from { opacity: 0; transform: translateY(14px); } }
.fp-in { animation: fp-in .45s cubic-bezier(.22,1,.36,1) both; }
@keyframes fp-row { from { opacity: 0; transform: translateY(-6px); } }
.fp-row { animation: fp-row .3s cubic-bezier(.22,1,.36,1) both; }
@media (prefers-reduced-motion: reduce) { .fp-in, .fp-row { animation: none; } }
`;

let seq = 0;
const blankItem = () => ({ key: `i${Date.now().toString(36)}${++seq}`, name: '', description: '', qty: '', unit: '', rate: '', taxPercent: '' });
const blank = () => ({
  company: { name: '', contactName: '', phone: '', email: '', website: '', address: '', taxId: '' },
  client: { name: '', phone: '', email: '', address: '' },
  system: { title: '', type: '', kw: '', panelCount: '', panelBrand: '', panelWatts: '', inverter: '', structure: '', warranty: '', annualKwh: '', tariff: '' },
  items: [blankItem()],
  pricing: { currency: 'INR', discount: '', discountIsPercent: true, discountRemark: '', subsidy: '' },
  terms: { validUntil: '', payment: '', conditions: '', notes: '' },
  design: { cover: '', primary: '#1D4ED8', accent: '#F5B82E' },
});

const STEPS = [
  { id: 'company', label: 'Your company', icon: Building2, title: 'Tell us about your company', sub: 'It goes on every page of the proposal: the cover, the header and the footer.' },
  { id: 'client', label: 'Your client', icon: UserRound, title: 'Who is the proposal for?', sub: 'The client’s name and site are printed on the cover and in the letter.' },
  { id: 'system', label: 'Solar system', icon: Sun, title: 'The solar system you are proposing', sub: 'These figures make the key numbers on the cover and the summary page.' },
  { id: 'price', label: 'Items & price', icon: ReceiptText, title: 'What it includes, and the price', sub: 'Enter each item with its quantity and rate. The amounts and totals are worked out for you.' },
  { id: 'terms', label: 'Terms', icon: ScrollText, title: 'Validity and terms', sub: 'How long the offer stands, how it is paid and your conditions.' },
  { id: 'design', label: 'Design', icon: Palette, title: 'Choose the design', sub: 'Pick a cover and your colours. The preview is the real document.' },
];
const SYSTEM_TYPES = ['On-grid', 'Off-grid', 'Hybrid'];
const COLOURS = ['#1D4ED8', '#0F6E56', '#B91C1C', '#C2410C', '#7C3AED', '#0E7490', '#111827'];
const ACCENTS = ['#F5B82E', '#F97316', '#22C55E', '#38BDF8', '#F43F5E'];

const FIELD = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/10';
const CELL = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[14.5px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/15';

/* ───────────── small pieces ───────────── */

function Field({ label, optional, hint, className, children }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px] font-medium text-slate-800">
        <span>{label}</span>
        {optional && <span className="text-[12.5px] font-normal text-slate-400">optional</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[12.5px] leading-snug text-slate-500">{hint}</span>}
    </label>
  );
}

const Text = ({ value, onChange, ...props }) => <input className={FIELD} value={value} onChange={(e) => onChange(e.target.value)} {...props} />;
const Num = ({ value, onChange, className, ...props }) => <input type="number" inputMode="decimal" min={0} step="any" className={className || FIELD} value={value} onChange={(e) => onChange(e.target.value)} onWheel={(e) => e.currentTarget.blur()} {...props} />;

function Chips({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={cx('h-11 rounded-xl border-2 px-4 text-[15px] font-semibold transition', value === o ? 'border-brand bg-brand-soft text-brand-ink' : 'border-slate-200 text-slate-700 hover:border-slate-300')}>{o}</button>
      ))}
    </div>
  );
}

/** A picture file as a small PNG/JPEG data: image (the longest side at most 480 px). */
async function readLogo(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  if (png.length <= 380 * 1024) return png;
  // a photograph as PNG is heavy: on white, as JPEG
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return flat.toDataURL('image/jpeg', 0.85);
}

/** What the browser can tell about the visitor's device (the server adds the browser, system and IP). */
const deviceInfo = () => ({
  screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
  language: navigator.language || '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  platform: navigator.userAgentData?.platform || navigator.platform || '',
});

const readDraft = () => {
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    return d?.form?.company && Array.isArray(d.form.items) ? d : null;
  } catch {
    return null;
  }
};

/** What a step still needs, as a sentence ('' when it is complete). */
function missing(step, f) {
  if (step === 0) return f.company.name.trim().length < 2 ? 'Enter your company name' : f.company.contactName.trim().length < 2 ? 'Enter your name' : f.company.phone.replace(/\D/g, '').length < 7 ? 'Enter your mobile number' : '';
  if (step === 1) return f.client.name.trim().length < 2 ? 'Enter your client’s name' : '';
  if (step === 2) return !f.system.type ? 'Choose the type of system' : !(Number(f.system.kw) > 0) ? 'Enter the size of the system in kW' : !(Number(f.system.annualKwh) > 0) ? 'Enter the energy the system makes in a year' : !(Number(f.system.tariff) > 0) ? 'Enter the price of a unit of electricity' : '';
  if (step === 3) {
    const rows = f.items.filter((it) => it.name.trim());
    if (!rows.length) return 'Add at least one item with its quantity and rate';
    const bad = rows.find((it) => !(Number(it.qty) > 0) || it.rate === '');
    return bad ? `Enter the quantity and rate of ${bad.name.trim()}` : '';
  }
  if (step === 5) return !f.design.cover ? 'Choose a cover design' : '';
  return '';
}

/* ───────────── the steps ───────────── */

function CompanyStep({ f, set, logo, setLogo, position, setPosition, setError }) {
  const c = f.company;
  const up = (patch) => set({ company: { ...c, ...patch } });
  const file = useRef(null);
  const [locating, setLocating] = useState(false);
  const pick = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    try {
      setLogo(await readLogo(picked));
    } catch {
      setError('That picture could not be read. Use a PNG or JPG file.');
    }
  };
  const locate = () => {
    if (!navigator.geolocation) return setError('This browser cannot share a location.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); setLocating(false); },
      () => { setLocating(false); setError('The location was not shared. That is fine: it is optional.'); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Company name" className="sm:col-span-2"><Text value={c.name} onChange={(v) => up({ name: v })} maxLength={160} autoComplete="organization" placeholder="The name your clients know you by" /></Field>
      <Field label="Your name"><Text value={c.contactName} onChange={(v) => up({ contactName: v })} maxLength={120} autoComplete="name" placeholder="Who signs the proposal" /></Field>
      <Field label="Mobile number"><Text value={c.phone} onChange={(v) => up({ phone: v.replace(/[^\d+ -]/g, '') })} type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="Printed on the proposal" /></Field>
      <Field label="Email" optional><Text value={c.email} onChange={(v) => up({ email: v })} type="email" maxLength={160} autoComplete="email" placeholder="name@company.com" /></Field>
      <Field label="Website" optional><Text value={c.website} onChange={(v) => up({ website: v })} maxLength={160} placeholder="www.company.com" /></Field>
      <Field label="Address" optional className="sm:col-span-2"><Text value={c.address} onChange={(v) => up({ address: v })} maxLength={400} autoComplete="street-address" placeholder="Office address" /></Field>
      <Field label="Tax number" optional hint="For example your GSTIN. Printed under your company’s name."><Text value={c.taxId} onChange={(v) => up({ taxId: v.toUpperCase() })} maxLength={30} placeholder="e.g. 27ABCDE1234F1Z5" /></Field>
      <div>
        <span className="mb-1.5 flex items-baseline justify-between text-[14px] font-medium text-slate-800"><span>Logo</span><span className="text-[12.5px] font-normal text-slate-400">optional</span></span>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
        {logo ? (
          <div className="flex h-11 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's own picture, held in the page */}
            <img src={logo} alt="Your logo" className="h-7 max-w-[120px] object-contain" />
            <button type="button" onClick={() => file.current?.click()} className="ml-auto text-[13.5px] font-semibold text-brand hover:underline">Change</button>
            <button type="button" aria-label="Remove the logo" onClick={() => setLogo('')} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => file.current?.click()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 text-[14.5px] font-medium text-slate-600 transition hover:border-brand hover:text-brand"><ImagePlus className="h-4 w-4" /> Upload your logo</button>
        )}
        <span className="mt-1.5 block text-[12.5px] text-slate-500">Without one, your company name is printed instead.</span>
      </div>
      <div className="sm:col-span-2">
        <button type="button" onClick={locate} disabled={locating || Boolean(position)} className={cx('inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-[14px] font-semibold transition', position ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-300 text-slate-700 hover:border-slate-400')}>
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : position ? <Check className="h-4 w-4" /> : <LocateFixed className="h-4 w-4" />}
          {position ? 'Location added' : 'Add my location (optional)'}
        </button>
      </div>
    </div>
  );
}

function ClientStep({ f, set }) {
  const c = f.client;
  const up = (patch) => set({ client: { ...c, ...patch } });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Client’s name" className="sm:col-span-2"><Text value={c.name} onChange={(v) => up({ name: v })} maxLength={160} placeholder="A person or a business" /></Field>
      <Field label="Mobile number" optional><Text value={c.phone} onChange={(v) => up({ phone: v.replace(/[^\d+ -]/g, '') })} type="tel" inputMode="tel" maxLength={20} /></Field>
      <Field label="Email" optional><Text value={c.email} onChange={(v) => up({ email: v })} type="email" maxLength={160} /></Field>
      <Field label="Site address" optional className="sm:col-span-2" hint="Where the system will be installed."><Text value={c.address} onChange={(v) => up({ address: v })} maxLength={400} placeholder="House / plot, street, city" /></Field>
    </div>
  );
}

function SystemStep({ f, set, money }) {
  const s = f.system;
  const up = (patch) => set({ system: { ...s, ...patch } });
  const yearly = Number(s.annualKwh) * Number(s.tariff);
  return (
    <div className="grid gap-5 sm:grid-cols-6">
      <Field label="Proposal title" optional className="sm:col-span-6" hint="The headline on the cover. Left empty, the system size is used."><Text value={s.title} onChange={(v) => up({ title: v })} maxLength={160} placeholder="e.g. 5 kW rooftop solar for the Kumar residence" /></Field>
      <div className="sm:col-span-6"><span className="mb-1.5 block text-[14px] font-medium text-slate-800">Type of system</span><Chips label="Type of system" value={s.type} options={SYSTEM_TYPES} onChange={(v) => up({ type: v })} /></div>
      <Field label="System size (kW)" className="sm:col-span-2"><Num value={s.kw} onChange={(v) => up({ kw: v })} placeholder="e.g. 5" /></Field>
      <Field label="Number of panels" optional className="sm:col-span-2"><Num value={s.panelCount} onChange={(v) => up({ panelCount: v })} step="1" placeholder="e.g. 9" /></Field>
      <Field label="Panel power (W)" optional className="sm:col-span-2"><Num value={s.panelWatts} onChange={(v) => up({ panelWatts: v })} placeholder="e.g. 550" /></Field>
      <Field label="Panel brand and model" optional className="sm:col-span-3"><Text value={s.panelBrand} onChange={(v) => up({ panelBrand: v })} maxLength={120} /></Field>
      <Field label="Inverter" optional className="sm:col-span-3"><Text value={s.inverter} onChange={(v) => up({ inverter: v })} maxLength={160} placeholder="Brand, model and size" /></Field>
      <Field label="Mounting structure" optional className="sm:col-span-3"><Text value={s.structure} onChange={(v) => up({ structure: v })} maxLength={160} placeholder="e.g. Hot-dip galvanised, elevated" /></Field>
      <Field label="Warranty" optional className="sm:col-span-3"><Text value={s.warranty} onChange={(v) => up({ warranty: v })} maxLength={200} placeholder="e.g. Panels 25 years, inverter 10 years" /></Field>
      <Field label="Energy made in a year (kWh)" className="sm:col-span-3" hint="Your own estimate for this site."><Num value={s.annualKwh} onChange={(v) => up({ annualKwh: v })} placeholder="e.g. 7000" /></Field>
      <Field label="Price of a unit of electricity" className="sm:col-span-3" hint="What the client pays the grid for one kWh."><Num value={s.tariff} onChange={(v) => up({ tariff: v })} placeholder="e.g. 8" /></Field>
      {yearly > 0 && <p className="fp-row rounded-xl bg-brand-soft px-4 py-3 text-[14.5px] text-brand-ink sm:col-span-6">That is a saving of about <b>{money(yearly)}</b> a year for your client. It is printed as “Year-1 savings”.</p>}
    </div>
  );
}

function PriceStep({ f, set, totals, money }) {
  const p = f.pricing;
  const upP = (patch) => set({ pricing: { ...p, ...patch } });
  const setItem = (i, patch) => set({ items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const remove = (i) => set({ items: f.items.length <= 1 ? [blankItem()] : f.items.filter((_, j) => j !== i) });
  const add = () => set({ items: [...f.items, blankItem()] });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[52ch] text-[14px] text-slate-600">One line for each thing in the price: panels, inverter, structure, cables, installation, net-metering work and so on.</p>
        <label className="flex items-center gap-2 text-[14px] font-medium text-slate-700">Currency
          <select value={p.currency} onChange={(e) => upP({ currency: e.target.value })} className="h-10 rounded-lg border border-slate-300 bg-white px-2.5 text-[14.5px] outline-none focus:border-brand">
            {Object.values(CURRENCIES).map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol.trim()})</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 text-[12.5px] font-semibold tracking-wide text-slate-500 uppercase">
              <th className="px-3 py-2.5">Item</th><th className="w-24 px-2 py-2.5">Qty</th><th className="w-24 px-2 py-2.5">Unit</th><th className="w-32 px-2 py-2.5">Rate</th><th className="w-24 px-2 py-2.5">Tax %</th><th className="w-36 px-3 py-2.5 text-right">Amount</th><th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {f.items.map((it, i) => (
              <tr key={it.key} className="fp-row border-t border-slate-200 align-top">
                <td className="px-3 py-2.5">
                  <input className={CELL} value={it.name} maxLength={160} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="e.g. Solar panels" aria-label={`Item ${i + 1}`} />
                  <input className={cx(CELL, 'mt-1.5 h-9 border-transparent bg-slate-50 text-[13.5px]')} value={it.description} maxLength={400} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description: brand, model, size…" aria-label={`Description of item ${i + 1}`} />
                </td>
                <td className="px-2 py-2.5"><Num className={CELL} value={it.qty} onChange={(v) => setItem(i, { qty: v })} aria-label="Quantity" placeholder="0" /></td>
                <td className="px-2 py-2.5"><input className={CELL} value={it.unit} maxLength={20} onChange={(e) => setItem(i, { unit: e.target.value })} aria-label="Unit" placeholder="Nos" /></td>
                <td className="px-2 py-2.5"><Num className={CELL} value={it.rate} onChange={(v) => setItem(i, { rate: v })} aria-label="Rate" placeholder="0" /></td>
                <td className="px-2 py-2.5"><Num className={CELL} value={it.taxPercent} onChange={(v) => setItem(i, { taxPercent: v })} aria-label="Tax percent" placeholder="0" max={100} /></td>
                <td className="px-3 py-2.5 text-right"><div className="h-10 text-[15px] leading-10 font-semibold text-slate-900 tabular-nums">{money(lineAmount(it))}</div></td>
                <td className="py-2.5 pr-2"><button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => remove(i)} className="mt-1 grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-slate-200 bg-slate-50/60 px-3 py-2.5">
          <button type="button" onClick={add} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[14px] font-semibold text-slate-700 hover:border-brand hover:text-brand"><Plus className="h-4 w-4" /> Add an item</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <span className="mb-1.5 flex items-baseline justify-between text-[14px] font-medium text-slate-800"><span>Discount</span><span className="text-[12.5px] font-normal text-slate-400">optional</span></span>
            <div className="flex gap-2">
              <Num value={p.discount} onChange={(v) => upP({ discount: v })} placeholder="0" aria-label="Discount" />
              <div role="radiogroup" aria-label="Discount as" className="flex shrink-0 overflow-hidden rounded-xl border border-slate-300">
                {[[true, '%'], [false, CURRENCIES[p.currency]?.symbol.trim() || p.currency]].map(([v, t]) => <button key={t} type="button" role="radio" aria-checked={p.discountIsPercent === v} onClick={() => upP({ discountIsPercent: v })} className={cx('w-12 text-[15px] font-semibold', p.discountIsPercent === v ? 'bg-brand text-brand-fg' : 'bg-white text-slate-600 hover:bg-slate-50')}>{t}</button>)}
              </div>
            </div>
            {Number(p.discount) > 0 && <input className={cx(FIELD, 'fp-row mt-2')} value={p.discountRemark} maxLength={200} onChange={(e) => upP({ discountRemark: e.target.value })} placeholder="Reason, e.g. Festival offer (optional)" />}
          </div>
          <Field label="Government subsidy" optional hint="Shown under the total as “Net payable after subsidy”."><Num value={p.subsidy} onChange={(v) => upP({ subsidy: v })} placeholder="0" /></Field>
        </div>
        <dl className="self-start rounded-2xl border border-slate-200 bg-slate-50 p-5 text-[15px]">
          <div className="flex justify-between py-1.5"><dt className="text-slate-600">Subtotal</dt><dd className="font-medium tabular-nums">{money(totals.subtotal)}</dd></div>
          {totals.discountAmount > 0 && <div className="flex justify-between py-1.5"><dt className="text-slate-600">Discount</dt><dd className="font-medium text-emerald-700 tabular-nums">− {money(totals.discountAmount)}</dd></div>}
          {totals.tax > 0 && <div className="flex justify-between py-1.5"><dt className="text-slate-600">Tax</dt><dd className="font-medium tabular-nums">{money(totals.tax)}</dd></div>}
          <div className="mt-2 flex items-baseline justify-between border-t border-slate-300 pt-3"><dt className="font-semibold text-slate-900">Total</dt><dd className="text-[1.5rem] font-semibold tracking-tight text-slate-950 tabular-nums">{money(totals.total)}</dd></div>
          {totals.subsidy > 0 && <div className="mt-1 flex justify-between text-[14.5px]"><dt className="text-slate-600">After subsidy</dt><dd className="font-semibold text-brand tabular-nums">{money(totals.net)}</dd></div>}
        </dl>
      </div>
    </div>
  );
}

/** A text with headings, lists, bold and links (the same editor the workspace uses for its proposal terms). */
const Rich = ({ label, ...props }) => (
  <div>
    <span className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px] font-medium text-slate-800"><span>{label}</span><span className="text-[12.5px] font-normal text-slate-400">optional</span></span>
    <RichTextEditor aria-label={label} {...props} />
  </div>
);

function TermsStep({ f, set }) {
  const t = f.terms;
  const up = (patch) => set({ terms: { ...t, ...patch } });
  return (
    <div className="grid gap-5">
      <Field label="Valid until" optional hint="Printed on the cover and above your terms." className="max-w-xs"><input type="date" className={FIELD} value={t.validUntil} min={new Date().toISOString().slice(0, 10)} onChange={(e) => up({ validUntil: e.target.value })} /></Field>
      <Rich label="Payment terms" value={t.payment} onChange={(v) => up({ payment: v })} minHeight={110} maxLength={2000} placeholder="e.g. 50% advance with the order, 40% on delivery of material, 10% after commissioning" />
      <Rich label="Terms & conditions" value={t.conditions} onChange={(v) => up({ conditions: v })} minHeight={170} maxLength={6000} placeholder="Your conditions: a numbered list reads best" />
      <Rich label="Notes" value={t.notes} onChange={(v) => up({ notes: v })} minHeight={90} maxLength={2000} placeholder="Anything else the client should know" />
    </div>
  );
}

/** A small drawing of each cover, in the chosen colours. */
function CoverThumb({ id, primary, accent }) {
  const bar = 'absolute rounded-sm bg-slate-300';
  return (
    <div className="relative aspect-[210/297] w-full overflow-hidden rounded-md border border-slate-200 bg-white">
      {id === 'magazine' && <><div className="absolute inset-x-0 top-[14%] h-[44%] rounded-bl-[60%]" style={{ background: `linear-gradient(135deg, ${primary}, #0f172a)` }} /><div className="absolute right-[8%] bottom-[30%] left-[8%] h-[12%] rounded-md bg-slate-100" /><div className="absolute inset-x-0 bottom-0 h-[13%] rounded-t-[50%]" style={{ background: primary }} /><div className="absolute bottom-[11%] left-0 h-[3%] w-full rounded-t-[50%]" style={{ background: accent }} /></>}
      {id === 'photo' && <><div className="absolute inset-x-0 top-0 h-[56%]" style={{ background: `linear-gradient(160deg, ${primary}, #0f172a)` }} /><div className="absolute top-[38%] left-[8%] h-[5%] w-[55%] rounded-sm bg-white/90" /><div className="absolute top-[46%] left-[8%] h-[3%] w-[35%] rounded-sm" style={{ background: accent }} /><div className={cx(bar, 'top-[64%] left-[8%] h-[10%] w-[84%] bg-slate-100')} /><div className={cx(bar, 'top-[80%] left-[8%] h-[3%] w-[50%]')} /></>}
      {id === 'panel' && <><div className="absolute inset-y-0 left-0 w-[36%]" style={{ background: primary }} /><div className="absolute top-[10%] left-[6%] h-[4%] w-[22%] rounded-sm bg-white/90" /><div className="absolute top-[18%] left-[6%] h-[2.5%] w-[16%] rounded-sm" style={{ background: accent }} /><div className="absolute top-[10%] right-[6%] left-[42%] h-[40%] rounded-md bg-slate-200" /><div className={cx(bar, 'top-[58%] right-[6%] left-[42%] h-[12%] bg-slate-100')} /><div className={cx(bar, 'top-[76%] left-[42%] h-[3%] w-[30%]')} /></>}
      {id === 'minimal' && <><div className="absolute top-[8%] left-[10%] h-[4%] w-[26%] rounded-sm" style={{ background: primary }} /><div className="absolute top-[18%] left-[10%] h-[6%] w-[62%] rounded-sm bg-slate-800" /><div className="absolute top-[27%] left-[10%] h-[3%] w-[30%] rounded-sm" style={{ background: accent }} /><div className="absolute top-[36%] right-[10%] left-[10%] h-[34%] rounded-md border-2 border-slate-200 bg-slate-50" /><div className={cx(bar, 'top-[78%] left-[10%] h-[3%] w-[80%] bg-slate-200')} /></>}
    </div>
  );
}

const Swatches = ({ label, value, options, onPick }) => (
  <div>
    <span className="mb-2 block text-[14px] font-medium text-slate-800">{label}</span>
    <div className="flex flex-wrap items-center gap-2">
      {options.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={value === c} onClick={() => onPick(c)} className={cx('grid h-9 w-9 place-items-center rounded-full transition', value === c ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-110')} style={{ background: c }}>{value === c && <Check className="h-4 w-4 text-white" strokeWidth={3} />}</button>)}
      <label className="relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-slate-400 text-slate-500" title="Your own colour"><Plus className="h-4 w-4" /><input type="color" value={value} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label}: your own colour`} /></label>
    </div>
  </div>
);

function DesignStep({ f, set }) {
  const d = f.design;
  const up = (patch) => set({ design: { ...d, ...patch } });
  return (
    <div className="space-y-7">
      <div>
        <span className="mb-2 block text-[14px] font-medium text-slate-800">Cover</span>
        <div role="radiogroup" aria-label="Cover design" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {COVER_STYLES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={d.cover === c.id} onClick={() => up({ cover: c.id })} className={cx('rounded-xl border-2 p-2 text-left transition', d.cover === c.id ? 'border-brand bg-brand-soft' : 'border-slate-200 hover:border-slate-300')}>
              <CoverThumb id={c.id} primary={d.primary} accent={d.accent} />
              <span className="mt-2 block text-[14px] font-semibold text-slate-900">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <Swatches label="Your main colour" value={d.primary} options={COLOURS} onPick={(c) => up({ primary: c })} />
      <Swatches label="Accent colour" value={d.accent} options={ACCENTS} onPick={(c) => up({ accent: c })} />
    </div>
  );
}

/* ───────────── side panels ───────────── */

const Line = ({ k, v }) => (v ? <div className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 truncate text-right font-medium text-slate-900">{v}</dd></div> : null);

function Summary({ f, logo, totals, money, step }) {
  const rows = f.items.filter((it) => it.name.trim());
  const fin = proposalSavings(f.system, totals.net || totals.total);
  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-6 lg:sticky lg:top-6">
      <div className="flex items-center gap-3">
        {logo
          // eslint-disable-next-line @next/next/no-img-element -- the visitor's own picture, held in the page
          ? <img src={logo} alt="" className="h-10 max-w-[110px] object-contain" />
          : <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><FileText className="h-5 w-5" /></span>}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-slate-950">{f.company.name.trim() || 'Your proposal'}</div>
          <div className="text-[13px] text-slate-500">Fills in as you type</div>
        </div>
      </div>
      <dl className="mt-5 divide-y divide-slate-100 text-[14px]">
        <Line k="For" v={f.client.name.trim()} />
        <Line k="System" v={Number(f.system.kw) > 0 ? `${f.system.kw} kW${f.system.type ? ` · ${f.system.type}` : ''}` : ''} />
        <Line k="Energy a year" v={Number(f.system.annualKwh) > 0 ? `${Number(f.system.annualKwh).toLocaleString()} kWh` : ''} />
        <Line k="Saves a year" v={fin.firstYearSavings > 0 ? money(fin.firstYearSavings) : ''} />
        <Line k="Items" v={rows.length ? String(rows.length) : ''} />
        <Line k="Valid until" v={f.terms.validUntil ? new Date(`${f.terms.validUntil}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} />
      </dl>
      <div className="mt-4 rounded-2xl bg-slate-950 px-5 py-4 text-white">
        <div className="text-[12.5px] font-medium text-white/60">Total</div>
        <div className="text-[1.7rem] leading-tight font-semibold tracking-tight tabular-nums">{money(totals.total)}</div>
        {totals.subsidy > 0 && <div className="mt-0.5 text-[13px] text-white/70">{money(totals.net)} after subsidy</div>}
        {fin.payback > 0 && <div className="mt-0.5 text-[13px] text-white/70">Pays back in {fin.payback.toFixed(1)} years</div>}
      </div>
      <ol className="mt-5 space-y-1.5">
        {STEPS.map((s, i) => {
          const done = i < step && !missing(i, f);
          return <li key={s.id} className={cx('flex items-center gap-2.5 text-[13.5px]', i === step ? 'font-semibold text-slate-950' : done ? 'text-slate-600' : 'text-slate-400')}><span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold', done ? 'bg-emerald-500 text-white' : i === step ? 'bg-brand text-brand-fg' : 'bg-slate-100 text-slate-500')}>{done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}</span>{s.label}</li>;
        })}
      </ol>
    </aside>
  );
}

function Preview({ url, busy, error }) {
  return (
    <aside className="lg:sticky lg:top-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,.4)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-[13.5px] font-semibold text-slate-700">Preview of your proposal</span>
          {busy && <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating</span>}
        </div>
        {url
          ? <iframe key={url} title="Proposal preview" src={`${url}#toolbar=0&navpanes=0&view=FitH`} className={cx('block h-[78vh] min-h-[520px] w-full bg-slate-100 transition-opacity', busy && 'opacity-60')} />
          : <div className="grid h-[78vh] min-h-[520px] place-items-center px-8 text-center text-[15px] text-slate-500">{error || (busy ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : 'Choose a cover on the left and your proposal appears here.')}</div>}
      </div>
    </aside>
  );
}

/* ───────────── the page ───────────── */

export default function FreeProposal() {
  // the draft kept in this browser, read once as the page starts (the page is drawn in the browser only)
  const [draft] = useState(readDraft);
  const [f, setF] = useState(() => draft?.form || blank());
  const [logo, setLogo] = useState(() => draft?.logo || '');
  const [saved, setSaved] = useState(() => (draft?.token ? { token: draft.token, refNo: draft.refNo } : null));
  const [step, setStep] = useState(() => Math.min(STEPS.length - 1, Math.max(0, draft?.step || 0)));
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState({ url: '', busy: false, error: '' });
  const root = useRef(null);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setError(''); };

  const currency = f.pricing.currency || 'INR';
  const money = (v) => formatMoney(v, currency);
  const totals = useMemo(() => proposalTotals(f.items, f.pricing), [f.items, f.pricing]);

  // keep the draft
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ form: f, logo, token: saved?.token, refNo: saved?.refNo, step }));
    } catch { /* storage full or switched off: the page still works */ }
  }, [f, logo, saved, step]);

  const payload = () => ({
    company: f.company,
    client: f.client,
    system: f.system,
    items: f.items.filter((it) => it.name.trim()).map(({ key, ...it }) => it),
    pricing: f.pricing,
    terms: f.terms,
    design: f.design,
  });

  /** Save the proposal (a new one the first time, the same one after that). */
  const save = async (extra = {}) => {
    const body = { ...payload(), logo, device: deviceInfo(), ...(position && { position }), ...extra };
    if (saved?.token) {
      try {
        const row = await api(`/api/public/free-proposals/${encodeURIComponent(saved.token)}`, { method: 'PUT', body });
        return { token: row.token, refNo: row.refNo };
      } catch (e) {
        if (e.status !== 404) throw e; // it was removed meanwhile: make it again below
      }
    }
    const row = await api('/api/public/free-proposals', { method: 'POST', body });
    return { token: row.token, refNo: row.refNo };
  };

  // the design step shows the real PDF: rebuilt a moment after the design changes
  const onDesign = step === STEPS.length - 1;
  const refNo = saved?.refNo || '';
  useEffect(() => {
    if (!onDesign || !f.design.cover) return undefined;
    let off = false;
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true, error: '' }));
      try {
        const { buildFreeProposalPdf } = await import('@/lib/freeProposalPdf');
        const { blob } = await buildFreeProposalPdf({ data: { ...f, items: f.items.filter((it) => it.name.trim()) }, logo, refNo, save: false });
        if (off) return;
        const url = URL.createObjectURL(blob);
        setPreview((p) => { if (p.url) URL.revokeObjectURL(p.url); return { url, busy: false, error: '' }; });
      } catch (e) {
        console.error(e);
        if (!off) setPreview((p) => ({ ...p, busy: false, error: 'The preview could not be made. You can still download the proposal.' }));
      }
    }, 350);
    return () => { off = true; clearTimeout(timer); };
  }, [onDesign, f, logo, refNo]);

  const go = (i) => {
    setError('');
    setStep(i);
    root.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const next = async () => {
    const m = missing(step, f);
    if (m) return setError(m);
    if (step < STEPS.length - 2) return go(step + 1);
    // from Terms to Design: everything is in, so the proposal is saved before its design is chosen
    const first = [0, 1, 2, 3].find((i) => missing(i, f));
    if (first !== undefined) { go(first); return setError(missing(first, f)); }
    setBusy(true);
    try {
      setSaved(await save());
      go(step + 1);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };
  const download = async () => {
    const m = missing(step, f);
    if (m) return setError(m);
    setBusy(true);
    try {
      const s = await save({ downloaded: true });
      setSaved(s);
      const { buildFreeProposalPdf } = await import('@/lib/freeProposalPdf');
      await buildFreeProposalPdf({ data: { ...f, items: f.items.filter((it) => it.name.trim()) }, logo, refNo: s.refNo, save: true });
    } catch (e) {
      console.error(e);
      setError(e.message || 'The proposal could not be made. Try again.');
    }
    setBusy(false);
  };
  const startOver = () => {
    if (!window.confirm('Start a new proposal? What you typed here is cleared.')) return;
    setF(blank());
    setLogo('');
    setSaved(null);
    setPreview({ url: '', busy: false, error: '' });
    go(0);
  };

  const S = STEPS[step];
  const body = [
    <CompanyStep key="company" f={f} set={set} logo={logo} setLogo={setLogo} position={position} setPosition={setPosition} setError={setError} />,
    <ClientStep key="client" f={f} set={set} />,
    <SystemStep key="system" f={f} set={set} money={money} />,
    <PriceStep key="price" f={f} set={set} totals={totals} money={money} />,
    <TermsStep key="terms" f={f} set={set} />,
    <DesignStep key="design" f={f} set={set} />,
  ][step];

  return (
    <div ref={root} style={PAGE_THEME} className="h-dvh overflow-x-hidden overflow-y-auto bg-slate-50 text-slate-900 antialiased">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1720px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-14">
          <Link href="/" className="flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-slate-950"><BrandMark size={28} /> {PRODUCT_NAME}</Link>
          <span className="hidden text-[14px] font-medium text-slate-500 sm:block">Free proposal maker · no sign-in needed</span>
          <div className="flex items-center gap-4 text-[14px] font-medium">
            <button type="button" onClick={startOver} className="text-slate-500 hover:text-slate-900">Start over</button>
            <Link href="/" className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to the site</Link>
          </div>
        </div>
      </header>

      {/* the steps: finished ones can be opened again */}
      <nav aria-label="Steps" className="border-b border-slate-200 bg-white">
        <ol className="mx-auto flex w-full max-w-[1720px] gap-1 overflow-x-auto px-5 py-3 sm:px-8 lg:px-14">
          {STEPS.map((s, i) => {
            const open = i <= step || !missing(i - 1, f);
            const done = i < step && !missing(i, f);
            return (
              <li key={s.id} className="flex shrink-0 items-center">
                <button type="button" disabled={!open || i > step} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined} className={cx('flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[14px] font-semibold transition', i === step ? 'bg-brand-soft text-brand-ink' : done ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400')}>
                  <span className={cx('grid h-7 w-7 place-items-center rounded-full text-[12.5px]', i === step ? 'bg-brand text-brand-fg' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500')}>{done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}</span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <span aria-hidden className={cx('mx-1 h-px w-5 sm:w-8', i < step ? 'bg-emerald-400' : 'bg-slate-200')} />}
              </li>
            );
          })}
        </ol>
      </nav>

      <main className={cx('mx-auto grid w-full max-w-[1720px] gap-8 px-5 py-8 sm:px-8 lg:px-14', onDesign ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' : 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
        <section key={S.id} className="fp-in min-w-0">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,.3)] sm:p-8">
            <div className="mb-7 flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand"><S.icon className="h-6 w-6" /></span>
              <div>
                <p className="text-[13px] font-semibold text-brand">Step {step + 1} of {STEPS.length}</p>
                <h1 className="text-[1.6rem] leading-tight font-semibold tracking-tight text-slate-950">{S.title}</h1>
                <p className="mt-1 text-[15px] text-slate-600">{S.sub}</p>
              </div>
            </div>
            {body}
            {error && <p role="alert" className="fp-row mt-6 rounded-xl bg-red-50 px-4 py-3 text-[14.5px] font-medium text-red-700">{error}</p>}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6">
              <button type="button" onClick={() => go(step - 1)} disabled={step === 0 || busy} className="inline-flex h-12 items-center gap-2 rounded-full border border-slate-300 px-5 text-[15px] font-semibold text-slate-700 transition hover:border-slate-400 disabled:invisible"><ArrowLeft className="h-4 w-4" /> Back</button>
              {onDesign ? (
                <button type="button" onClick={download} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px] font-semibold text-brand-fg shadow-[0_10px_24px_-10px_var(--brand)] transition hover:-translate-y-0.5 hover:bg-brand-600 disabled:translate-y-0 disabled:opacity-70">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-4 w-4" />} Download the proposal (PDF)</button>
              ) : (
                <button type="button" onClick={next} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px] font-semibold text-brand-fg shadow-[0_10px_24px_-10px_var(--brand)] transition hover:-translate-y-0.5 hover:bg-brand-600 disabled:translate-y-0 disabled:opacity-70">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{step === STEPS.length - 2 ? 'Create the proposal' : 'Continue'} <ArrowRight className="h-4 w-4" /></button>
              )}
            </div>
          </div>
          <p className="mt-4 flex gap-2 px-1 text-[13px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> When you create the proposal, {PRODUCT_NAME} saves what you typed here, your device type and your approximate location, so that our team can contact you. A draft is kept in this browser while you type.</p>
        </section>
        {onDesign ? <Preview url={preview.url} busy={preview.busy} error={preview.error} /> : <Summary f={f} logo={logo} totals={totals} money={money} step={step} />}
      </main>
    </div>
  );
}

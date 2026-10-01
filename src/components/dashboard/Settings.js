'use client';

// Company profile, theme colours, logo, e-signature, QR code and proposal text.
import { Building2, Check, FileText, Hash, Image as ImageIcon, Palette, PenLine, QrCode, Trash2, Upload, UserCog } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { THEME_PRESETS, foregroundOn, isHex, luminance } from '@/lib/theme';
import { companySelfSchema, invoiceNumberingSchema, useValidation } from '@/lib/validation';
import { Alert, Badge, Button, Card, CardHeader, FormField, ImageFrame, ImageSourceButtons, Input, NameInput, PhoneInput, PageHeader, Spinner, Tabs, Textarea, cx, showError, toast } from '../kit';
import RichTextEditor from '../kit/RichTextEditor';
import AccountSettings from '../layout/AccountSettings';

function useCompanyForm(keys, schema) {
  const { company, setCompany } = useSession();
  const [form, setForm] = useState(() => Object.fromEntries(keys.map((k) => [k, company[k] ?? ''])));
  const [busy, setBusy] = useState(false);
  const v = useValidation(schema || companySelfSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async (e, body, message = 'Saved') => {
    e?.preventDefault();
    body ??= v.validate();
    if (!body) return;
    setBusy(true);
    try {
      setCompany(await api('/api/company', { method: 'PUT', body }));
      toast.success(message);
    } catch (err) {
      showError(err, 'Your changes were not saved');
    }
    setBusy(false);
  };
  return { company, form, set, save, busy, v };
}

function Profile() {
  const { form, set, save, busy, v } = useCompanyForm(['name', 'email', 'phone', 'website', 'taxId', 'pan', 'address']);
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Company profile" description="Printed in the “Prepared by” block and footer of every proposal." />
      <form onSubmit={save} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
        <FormField label="Company name" className="sm:col-span-2" error={v.error('name')}><NameInput kind="business" maxLength={120} value={form.name} onValue={(x) => set({ name: x })} /></FormField>
        <FormField label="Contact email" optional error={v.error('email')}><Input type="email" value={form.email} onValue={(x) => set({ email: x })} /></FormField>
        <FormField label="Phone" optional error={v.error('phone')}><PhoneInput maxLength={20} value={form.phone} onValue={(x) => set({ phone: x })} /></FormField>
        <FormField label="Website" optional error={v.error('website')}><Input maxLength={200} value={form.website} onValue={(x) => set({ website: x })} placeholder="www.company.com" /></FormField>
        <FormField label="GSTIN" optional hint="15 characters, like 27ABCDE1234F1Z5." error={v.error('taxId')}><Input maxLength={15} value={form.taxId} onValue={(x) => set({ taxId: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} className="uppercase" /></FormField>
        <FormField label="PAN" optional hint="10 characters, like ABCDE1234F." error={v.error('pan')}><Input maxLength={10} value={form.pan} onValue={(x) => set({ pan: x.replace(/[^A-Za-z0-9]/g, '').toUpperCase() })} className="uppercase" /></FormField>
        <FormField label="Address" optional className="sm:col-span-2" error={v.error('address')}><Textarea rows={2} maxLength={400} value={form.address} onValue={(x) => set({ address: x })} /></FormField>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Save profile</Button></div>
      </form>
    </Card>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <FormField label={label} error={isHex(value) ? undefined : 'Use a hex colour like #1d4ed8'}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} value={isHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" />
        <Input value={value} onValue={onChange} maxLength={7} className="font-mono uppercase" />
      </div>
    </FormField>
  );
}

function ThemePreview({ primary, accent, company }) {
  const fg = foregroundOn(primary);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-[11px] shadow-sm" aria-hidden>
      <div className="flex items-center justify-between px-4 py-3">
        {company.logo ? <ImageFrame src={assetUrl(company.logo)} padding="p-0" className="h-7 w-[104px] [&>img]:object-left" /> : <span className="text-sm font-bold" style={{ color: primary }}>{company.name}</span>}
        <span className="text-right text-slate-500"><b className="block text-xs text-slate-900">Solar Proposal</b>Prepared for Ravi Kumar</span>
      </div>
      <div className="h-1.5" style={{ background: primary }} />
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2">
          {[['System size', '5.50 kWp'], ['Annual energy', '8,140 kWh'], ['Payback', '4.2 years']].map(([l, v]) => (
            <div key={l} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><div className="text-[9px] text-slate-500 uppercase">{l}</div><div className="text-xs font-semibold text-slate-900">{v}</div></div>
          ))}
        </div>
        <div className="flex h-12 items-end gap-1">
          {[40, 55, 72, 86, 100, 92, 70, 66, 78, 74, 52, 38].map((h, i) => <span key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: accent }} />)}
        </div>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="grid grid-cols-3 px-2 py-1 font-semibold" style={{ background: primary, color: fg }}><span>Item</span><span>Qty</span><span>Amount</span></div>
          <div className="grid grid-cols-3 px-2 py-1 text-slate-600"><span>Solar panels</span><span>10</span><span>1,05,000</span></div>
        </div>
        <span className="inline-block rounded-md px-3 py-1.5 font-semibold" style={{ background: primary, color: fg }}>Button</span>
      </div>
    </div>
  );
}

const ASSETS = [
  { kind: 'logo', title: 'Company logo', icon: ImageIcon, tip: 'Wide, transparent PNG · about 600 × 200 px', where: 'Sidebar, designer and the header of every PDF page.' },
  { kind: 'signature', title: 'E-signature', icon: PenLine, tip: 'Dark ink on a transparent PNG · about 600 × 200 px', where: 'Above the signatory’s name on the sign-off page.' },
  { kind: 'qr', title: 'QR code', icon: QrCode, tip: 'Square image · at least 400 × 400 px', where: 'Payment (UPI), website or contact QR on the sign-off page.' },
];

function AssetUploader({ asset }) {
  const { kind, title, icon: Icon, tip, where } = asset;
  const { company, setCompany } = useSession();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const url = assetUrl(company[kind]);

  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return showError('Upload a PNG, JPG or WebP image.', 'That file can’t be used');
    if (file.size > 2 * 1024 * 1024) return showError('The image must be 2 MB or smaller.', 'That file is too large');
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      setCompany(await api(`/api/company/assets/${kind}`, { method: 'POST', form }));
      toast.success(`${title} updated`);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true);
    try {
      setCompany(await api(`/api/company/assets/${kind}`, { method: 'DELETE' }));
      toast.success(`${title} removed`);
    } catch (e) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col rounded-xl border border-slate-200">
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon className="h-4 w-4" /></span>
        <h3 className="min-w-0 flex-1 text-sm leading-tight font-semibold text-slate-900">{title}</h3>
        <Badge tone={url ? 'green' : 'slate'} dot>{url ? 'Uploaded' : 'Not set'}</Badge>
      </div>

      {/* same frame for all three, so a wide logo, a thin signature and a square QR line up */}
      <div className="p-4">
        <button
          type="button"
          aria-label={url ? `Replace ${title}` : `Upload ${title}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}
          className={cx('group relative block h-40 w-full overflow-hidden rounded-lg border-2 border-dashed transition', over ? 'border-brand bg-brand-soft' : url ? 'border-slate-200 hover:border-brand' : 'border-slate-300 hover:border-brand hover:bg-brand-soft/50')}
        >
          {url && <ImageFrame src={url} alt={title} checker padding="p-5" className="absolute inset-0 h-full w-full" />}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-white/70"><Spinner /></span>
          ) : url ? (
            <span className="absolute inset-0 grid place-items-center bg-slate-950/55 text-[13px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Replace image</span>
            </span>
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-brand"><Upload className="h-5 w-5" /></span>
              <span className="text-[13px] font-medium text-slate-700">Click to upload <span className="font-normal text-slate-500">or drag &amp; drop</span></span>
            </span>
          )}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      </div>

      <div className="flex-1 px-4 text-[13px] leading-relaxed text-slate-600">
        {where}
        <div className="mt-1 text-xs text-slate-400">{tip} · PNG, JPG or WebP up to 2 MB</div>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-slate-100 px-4 py-3">
        <ImageSourceButtons onFiles={upload} disabled={busy} galleryLabel={url ? 'Replace from gallery' : 'Choose from gallery'} />
        {url && <Button size="sm" variant="dangerGhost" icon={Trash2} disabled={busy} onClick={remove} className="ml-auto">Remove</Button>}
      </div>
    </div>
  );
}

/** How the three images sit on the PDF: page header and the sign-off block. */
function PlacementPreview() {
  const company = useSession((s) => s.company);
  const placeholder = (label) => <span className="absolute inset-0 grid place-items-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">{label}</span>;
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-hidden>
      <div>
        <div className="mb-2 text-xs font-medium text-slate-500">PDF page header</div>
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="relative block h-9 w-32 shrink-0">{company.logo ? <ImageFrame src={assetUrl(company.logo)} padding="p-0" className="h-full w-full [&>img]:object-left" /> : placeholder('Your logo')}</span>
            <span className="text-right text-[10px] leading-tight text-slate-500"><b className="block text-[11px] tracking-wide text-slate-900">PROPOSAL SUMMARY</b>Ref. SP-20260919 | Client name</span>
          </div>
          <div className="relative mt-3 h-px bg-slate-200"><span className="absolute -top-px left-0 h-[3px] w-14 bg-brand" /></div>
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-slate-500">Sign-off block (last page)</div>
        <div className="grid grid-cols-[1fr_1fr_88px] gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          {[[`For ${company.name}`, company.signatoryName || 'Signatory name', company.signatoryTitle || 'Title', true], ['Accepted by client', 'Client name', 'Signature & date', false]].map(([label, name, sub, signed]) => (
            <div key={label} className="min-w-0 border border-slate-200 border-t-brand px-2.5 pt-2 pb-2.5 [border-top-width:3px]">
              <div className="truncate text-[8px] font-bold tracking-wide text-slate-500 uppercase">{label}</div>
              <span className="relative mt-1 block h-10">{signed && (company.signature ? <ImageFrame src={assetUrl(company.signature)} padding="p-0" className="h-full w-full bg-transparent [&>img]:object-left" /> : placeholder('Your e-signature'))}</span>
              <div className="mt-1 border-t border-slate-800 pt-1">
                <div className="truncate text-[11px] font-semibold text-slate-900">{name}</div>
                <div className="truncate text-[9px] text-slate-500">{sub}</div>
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center justify-center bg-slate-50 p-2">
            <span className="relative block h-14 w-14">{company.qr ? <ImageFrame src={assetUrl(company.qr)} padding="p-0" className="h-full w-full" /> : placeholder('QR')}</span>
            <div className="mt-1.5 line-clamp-2 text-center text-[8px] leading-tight font-semibold text-slate-700">{company.qrLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Branding() {
  const { company, setCompany } = useSession();
  const [theme, setTheme] = useState({ primary: company.theme.primary, accent: company.theme.accent });
  const [busy, setBusy] = useState(false);
  const valid = isHex(theme.primary) && isHex(theme.accent);
  const dirty = theme.primary !== company.theme.primary || theme.accent !== company.theme.accent;

  const save = async () => {
    setBusy(true);
    try {
      setCompany(await api('/api/company', { method: 'PUT', body: { theme } }));
      toast.success('Theme saved — your workspace and proposals now use it');
    } catch (e) {
      showError(e, 'The theme was not saved');
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-6">
      {!company.features.pdfBranding && <Alert tone="warn">Branded PDFs are not enabled on your plan, so proposals use the standard look. Contact the platform administrator to enable it.</Alert>}
      <Card>
        <CardHeader title="Theme colours" description="Used across your workspace, the designer and your proposal PDFs." action={<Button variant="primary" loading={busy} disabled={!valid || !dirty} onClick={save}>Save theme</Button>} />
        <div className="grid gap-8 p-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Primary colour" value={theme.primary} onChange={(v) => setTheme({ ...theme, primary: v })} />
              <ColorField label="Accent colour" value={theme.accent} onChange={(v) => setTheme({ ...theme, accent: v })} />
            </div>
            {isHex(theme.primary) && luminance(theme.primary) > 0.6 && <Alert tone="warn">This primary colour is very light. Headings and links may be hard to read — consider a darker shade.</Alert>}
            <div>
              <div className="mb-2 text-[13px] font-medium text-slate-700">Presets</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {THEME_PRESETS.map((p) => {
                  const active = p.primary === theme.primary && p.accent === theme.accent;
                  return (
                    <button key={p.name} type="button" onClick={() => setTheme({ primary: p.primary, accent: p.accent })} aria-pressed={active} className={cx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] font-medium transition', active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400')}>
                      <span className="flex shrink-0 overflow-hidden rounded-full ring-1 ring-black/10"><span className="h-5 w-2.5" style={{ background: p.primary }} /><span className="h-5 w-2.5" style={{ background: p.accent }} /></span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {active && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-slate-700">Proposal preview</div>
            {valid && <ThemePreview primary={theme.primary} accent={theme.accent} company={company} />}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Logo, e-signature and QR code" description="Images are saved as soon as you upload them." />
        <div className="grid gap-5 p-6 sm:grid-cols-2 xl:grid-cols-3">
          {ASSETS.map((asset) => <AssetUploader key={asset.kind} asset={asset} />)}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-5">
          <div className="mb-4 text-[13px] font-semibold text-slate-900">Where they appear on your proposal</div>
          <PlacementPreview />
        </div>
      </Card>
    </div>
  );
}

function Proposal() {
  const { form, set, save, busy, v } = useCompanyForm(['signatoryName', 'signatoryTitle', 'qrLabel', 'tagline', 'pdfTerms']);
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Proposal text" description="The cover tagline, and the sign-off on the last page next to your e-signature and QR code." />
      <form onSubmit={save} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
        <FormField label="Signatory name" optional error={v.error('signatoryName')}><NameInput maxLength={120} value={form.signatoryName} onValue={(x) => set({ signatoryName: x })} placeholder="Anita Sharma" /></FormField>
        <FormField label="Signatory title" optional error={v.error('signatoryTitle')}><Input maxLength={80} value={form.signatoryTitle} onValue={(x) => set({ signatoryTitle: x })} placeholder="Director" /></FormField>
        <FormField label="Cover tagline" hint="Handwritten-style line on the first page of the PDF." optional className="sm:col-span-2" error={v.error('tagline')}><Input maxLength={160} value={form.tagline} onValue={(x) => set({ tagline: x })} placeholder="Clean energy for a brighter tomorrow" /></FormField>
        <FormField label="QR code caption" optional className="sm:col-span-2" error={v.error('qrLabel')}><Input maxLength={80} value={form.qrLabel} onValue={(x) => set({ qrLabel: x })} placeholder="Scan to pay / contact us" /></FormField>
        {/* not a <label>: clicking toolbar buttons inside a label would re-focus the editor */}
        <div className="sm:col-span-2">
          <div className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-slate-700">Terms &amp; conditions <span className="text-xs font-normal text-slate-400">Optional</span></div>
          <RichTextEditor aria-label="Terms and conditions" value={form.pdfTerms} onChange={(v) => set({ pdfTerms: v })} placeholder="Payment terms, validity, warranty notes…" />
          <p className="-mt-4 max-w-[75%] text-xs text-slate-500">Headings, bold, italic, underline, lists, indents, alignment and links are all carried over to the PDF.</p>
        </div>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Save</Button></div>
      </form>
    </Card>
  );
}

const padSeq = (n, width) => String(n ?? 1).padStart(width || 4, '0');

function InvoiceNumbering() {
  const { company, setCompany } = useSession();
  const saved = company.invoiceNumbering || {};
  const [form, setForm] = useState({ prefix: saved.prefix ?? 'INV-', next: padSeq(saved.next, saved.width) });
  const [busy, setBusy] = useState(false);
  const v = useValidation(invoiceNumberingSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const okNext = /^\d{1,10}$/.test(form.next) && Number(form.next) >= 1;
  const preview = (offset) => `${form.prefix}${String(Number(form.next) + offset).padStart(form.next.length, '0')}`;
  const save = async (e) => {
    e.preventDefault();
    const body = v.validate();
    if (!body) return;
    setBusy(true);
    try {
      setCompany(await api('/api/company', { method: 'PUT', body: { invoiceNumbering: body } }));
      toast.success('Invoice numbering saved');
    } catch (err) {
      showError(err, 'Your changes were not saved');
    }
    setBusy(false);
  };
  return (
    <Card className="max-w-3xl">
      <CardHeader title="Invoice numbering" description="Every invoice gets the fixed part followed by a running number that goes up by one each time." />
      <form onSubmit={save} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
        <FormField label="Fixed part" optional hint="Letters, digits and - / _ . — for example INVCMP2026 or INV/26-27/." error={v.error('prefix')}>
          <Input maxLength={20} value={form.prefix} onValue={(x) => set({ prefix: x.replace(/\s/g, '') })} placeholder="INV-" className="font-mono" />
        </FormField>
        <FormField label="Next number" hint="Type it with leading zeros to fix the width: 0001 gives 0001, 0002 … 0099, 0100." error={v.error('next')}>
          <Input inputMode="numeric" maxLength={10} value={form.next} onValue={(x) => set({ next: x.replace(/\D/g, '') })} placeholder="0001" className="font-mono" />
        </FormField>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview</div>
          {okNext ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <span className="font-semibold text-slate-900">{preview(0)}</span>
              <span className="text-slate-400">then</span>
              <span className="text-slate-600">{preview(1)}</span>
              <span className="text-slate-600">{preview(2)}</span>
              <span className="text-slate-400">…</span>
            </div>
          ) : (
            <div className="mt-1 text-slate-500">Enter the next number to see how invoices will be numbered.</div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Current setting: <span className="font-mono text-slate-700">{saved.nextInvoiceNo || `${saved.prefix ?? 'INV-'}${padSeq(saved.next, saved.width)}`}</span> will be the next invoice. Numbers already issued are never reused: if you point the counter at a used number, the save is refused.
          </p>
        </div>
        <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy}>Save numbering</Button></div>
      </form>
    </Card>
  );
}

const TABS = [
  { id: 'profile', label: 'Company profile', icon: Building2 },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'proposal', label: 'Proposal PDF', icon: FileText },
  { id: 'invoices', label: 'Invoice numbering', icon: Hash },
  { id: 'account', label: 'My account', icon: UserCog },
];

export default function Settings() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'profile';
  return (
    <>
      <PageHeader title="Settings & branding" description="How your company appears in the workspace and on client proposals." />
      <Tabs className="mb-6" tabs={TABS} value={tab} onChange={(t) => router.replace(t === 'profile' ? '/dashboard/settings' : `/dashboard/settings?tab=${t}`)} />
      {tab === 'profile' && <Profile />}
      {tab === 'branding' && <Branding />}
      {tab === 'proposal' && <Proposal />}
      {tab === 'invoices' && <InvoiceNumbering />}
      {tab === 'account' && <AccountSettings />}
    </>
  );
}

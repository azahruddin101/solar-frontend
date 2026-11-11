'use client';

// Super admin: the proposals made with the free proposal maker on the public site (/free-proposal), without
// signing in. Each is a lead for the platform: the solar company that made it, the proposal itself, the device
// they used and where they were. These are kept on their own and are no part of any company's workspace.
import { Download, Eye, FileText, Mail, MapPin, Monitor, Phone, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { lineAmount } from '@/lib/freeProposalCalc';
import { useResource } from '@/lib/useResource';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, IconButton, LoadingBlock, Modal, PageHeader, RichTextContent, Select, Table, Td, Textarea, Th, Tr, formatDate, timeAgo, toast } from '../kit';

const STATUS = {
  new: { tone: 'amber', label: 'New' },
  contacted: { tone: 'blue', label: 'Contacted' },
  converted: { tone: 'green', label: 'Converted' },
  closed: { tone: 'slate', label: 'Closed' },
};
const DEVICE_ICON = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

const moneyOf = (row) => (v) => formatMoney(v, row.data?.pricing?.currency || 'INR');
const mapLink = (loc) => (loc?.lat != null && loc?.lng != null ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : '');
const deviceLine = (d = {}) => [d.browser, d.os].filter(Boolean).join(' on ') || 'Unknown device';

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-6 py-2 text-sm"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-slate-900">{children || '—'}</dd></div>
);
const Block = ({ title, children, className }) => <section className={className}><h3 className="mb-1 text-sm font-semibold text-slate-900">{title}</h3>{children}</section>;

/** The same PDF the visitor downloaded, built again from what was saved. */
async function openPdf(row) {
  const { buildFreeProposalPdf } = await import('@/lib/freeProposalPdf');
  await buildFreeProposalPdf({ data: row.data, logo: row.logo || '', refNo: row.refNo, save: true });
}

function Details({ id, onClose, onSaved }) {
  const [row, setRow] = useState(null);
  const [failed, setFailed] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let off = false;
    api(`/api/admin/free-proposals/${id}`).then((r) => { if (!off) { setRow(r); setNotes(r.adminNotes || ''); } }).catch((e) => !off && setFailed(e.message));
    return () => { off = true; };
  }, [id]);

  const save = async () => {
    setBusy('notes');
    try {
      onSaved(await api(`/api/admin/free-proposals/${id}`, { method: 'PATCH', body: { adminNotes: notes } }));
      toast.success('Notes saved');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy('');
  };
  const pdf = async () => {
    setBusy('pdf');
    try {
      await openPdf(row);
    } catch (err) {
      console.error(err);
      toast.error('The proposal PDF could not be made.');
    }
    setBusy('');
  };

  const d = row?.data || {};
  const co = d.company || {};
  const cl = d.client || {};
  const sys = d.system || {};
  const t = row?.totals || {};
  const dev = row?.device || {};
  const loc = row?.location || {};
  const money = row ? moneyOf(row) : (v) => v;
  return (
    <Modal open onClose={onClose} size="xl" title={row ? `${row.companyName || row.name || 'Visitor'} · ${row.refNo}` : 'Free proposal'} description={row ? `Made with the free proposal maker · ${formatDate(row.createdAt)}${row.downloads ? ` · downloaded ${row.downloads} time${row.downloads === 1 ? '' : 's'}` : ' · not downloaded yet'}` : undefined} footer={<><Button onClick={onClose}>Close</Button>{row?.totals && <Button icon={Download} loading={busy === 'pdf'} onClick={pdf}>Proposal PDF</Button>}{row && <Button variant="primary" loading={busy === 'notes'} onClick={save}>Save notes</Button>}</>}>
      {failed ? <Alert>{failed}</Alert> : !row ? <LoadingBlock /> : (
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          {!row.totals && <Alert tone="info" className="md:col-span-2">Made with the first, bill-only version of the page: {row.name}{row.city ? `, ${row.city}` : ''}{row.monthlyBill ? `, monthly bill ${money(row.monthlyBill)}` : ''}. The contact, device and location below still apply.</Alert>}
          <Block title="Solar company (the lead)">
            {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's uploaded logo, a data: image */}
            {row.logo && <img src={row.logo} alt="Their logo" className="mb-2 h-10 max-w-[160px] object-contain" />}
            <dl className="divide-y divide-slate-100">
              <Row label="Company">{co.name}</Row>
              <Row label="Contact">{co.contactName}</Row>
              <Row label="Mobile">{(co.phone || row.phone) && <a className="text-brand hover:underline" href={`tel:${co.phone || row.phone}`}>{co.phone || row.phone}</a>}</Row>
              <Row label="Email">{(co.email || row.email) && <a className="text-brand hover:underline" href={`mailto:${co.email || row.email}`}>{co.email || row.email}</a>}</Row>
              <Row label="Website">{co.website}</Row>
              <Row label="Address">{co.address}</Row>
              <Row label="Tax number">{co.taxId}</Row>
            </dl>
          </Block>
          <Block title="Their client and system">
            <dl className="divide-y divide-slate-100">
              <Row label="Client">{cl.name}</Row>
              <Row label="Client mobile">{cl.phone}</Row>
              <Row label="Site">{cl.address}</Row>
              <Row label="System">{[sys.kw ? `${sys.kw} kW` : '', sys.type].filter(Boolean).join(' · ')}</Row>
              <Row label="Panels">{[sys.panelCount ? `${sys.panelCount} ×` : '', sys.panelBrand, sys.panelWatts ? `${sys.panelWatts} W` : ''].filter(Boolean).join(' ')}</Row>
              <Row label="Inverter">{sys.inverter}</Row>
              <Row label="Energy a year">{sys.annualKwh ? `${Number(sys.annualKwh).toLocaleString()} kWh at ${money(sys.tariff)} a unit` : ''}</Row>
            </dl>
          </Block>
          <Block title="Price" className="md:col-span-2">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  {(d.items || []).map((it, i) => (
                    <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2"><div className="font-medium text-slate-900">{it.name}</div>{it.description && <div className="text-xs text-slate-500">{it.description}</div>}</td><td className="px-3 py-2 text-right tabular-nums">{it.qty} {it.unit}</td><td className="px-3 py-2 text-right tabular-nums">{money(it.rate)}</td><td className="px-3 py-2 text-right tabular-nums">{it.taxPercent ? `${it.taxPercent}%` : '—'}</td><td className="px-3 py-2 text-right font-medium tabular-nums">{money(lineAmount(it))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-2 ml-auto max-w-xs divide-y divide-slate-100">
              {t.discountAmount > 0 && <Row label="Discount">− {money(t.discountAmount)}</Row>}
              {t.tax > 0 && <Row label="Tax">{money(t.tax)}</Row>}
              <Row label="Total"><span className="text-base">{money(t.total)}</span></Row>
              {t.subsidy > 0 && <Row label="After subsidy">{money(t.net)}</Row>}
            </dl>
          </Block>
          {(d.terms?.payment || d.terms?.conditions || d.terms?.notes || d.terms?.validUntil) && (
            <Block title="Terms" className="md:col-span-2">
              {d.terms.validUntil && <p className="text-sm text-slate-700">Valid until <b>{formatDate(d.terms.validUntil)}</b></p>}
              {[['Payment terms', d.terms.payment], ['Terms & conditions', d.terms.conditions], ['Notes', d.terms.notes]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="mt-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="mb-1 text-xs font-semibold text-slate-500 uppercase">{k}</div>
                  <RichTextContent html={v} className="text-sm text-slate-800" />
                </div>
              ))}
            </Block>
          )}
          <Block title="Device">
            <dl className="divide-y divide-slate-100">
              <Row label="Kind">{dev.type ? dev.type[0].toUpperCase() + dev.type.slice(1) : ''}</Row>
              <Row label="Browser">{dev.browser}</Row>
              <Row label="System">{[...new Set([dev.os, dev.platform].filter(Boolean))].join(' · ')}</Row>
              <Row label="Screen">{dev.screen}</Row>
              <Row label="Language">{dev.language}</Row>
            </dl>
            {dev.userAgent && <p className="mt-2 break-all rounded-md bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-500">{dev.userAgent}</p>}
          </Block>
          <Block title="Location">
            <dl className="divide-y divide-slate-100">
              <Row label="Shared position">{mapLink(loc) && <a className="text-brand hover:underline" href={mapLink(loc)} target="_blank" rel="noreferrer">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.accuracyM ? ` (±${Math.round(loc.accuracyM)} m)` : ''}</a>}</Row>
              <Row label="Time zone">{loc.timezone}</Row>
              <Row label="IP address">{loc.ip}</Row>
              <Row label="Came from">{row.referrer}</Row>
            </dl>
            {!mapLink(loc) && <p className="mt-2 text-xs text-slate-500">The visitor did not share their position; the addresses above are what they typed.</p>}
          </Block>
          <Block title="Your notes" className="md:col-span-2">
            <Textarea rows={3} maxLength={2000} value={notes} onValue={setNotes} placeholder="e.g. Called on Monday, wants a demo of the full product next week" />
          </Block>
        </div>
      )}
    </Modal>
  );
}

export default function AdminFreeProposals() {
  const { data, setData, loading, error } = useResource('/api/admin/free-proposals');
  const [open, setOpen] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const replace = (row) => setData((list) => list.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
  const setStatus = async (row, status) => {
    try {
      replace(await api(`/api/admin/free-proposals/${row.id}`, { method: 'PATCH', body: { status } }));
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/free-proposals/${removing.id}`, { method: 'DELETE' });
      setData((list) => list.filter((r) => r.id !== removing.id));
      toast.success('Removed');
      setRemoving(null);
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  };

  const rows = (data || []).filter((r) => !filter || r.status === filter);

  return (
    <>
      <PageHeader title="Free proposals" description="Solar companies that made a proposal with the free proposal maker on the public site, without signing in. Treat each one as a lead: call them, then mark what happened.">
        <Select aria-label="Status" value={filter} onValue={setFilter} className="w-44">
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </Select>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      <Card className="overflow-hidden">
        {loading && !data ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={FileText} title={data?.length ? 'Nothing with this status' : 'No free proposals yet'} description={data?.length ? 'Choose another status above.' : 'When someone makes a proposal with the free proposal maker, it appears here with their device and location.'} />
        ) : (
          <Table>
            <thead><tr><Th>Company &amp; contact</Th><Th>Proposal</Th><Th>Device</Th><Th>Location</Th><Th>Received</Th><Th>Status</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS[r.status] || STATUS.new;
                const DeviceIcon = DEVICE_ICON[r.device?.type] || Monitor;
                const link = mapLink(r.location);
                const money = moneyOf(r);
                const sys = r.data?.system || {};
                const count = r.data?.items?.length || 0;
                return (
                  <Tr key={r.id}>
                    <Td>
                      <button type="button" onClick={() => setOpen(r.id)} className="text-left font-semibold text-slate-900 hover:text-brand">{r.companyName || r.contactName || r.name || '—'}</button>
                      <div className="text-xs text-slate-600">{r.contactName}</div>
                      {r.phone && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600"><Phone className="h-3 w-3" /> <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a></div>}
                      {r.email && <div className="flex items-center gap-1.5 text-xs text-slate-500"><Mail className="h-3 w-3" /> <a href={`mailto:${r.email}`} className="max-w-[200px] truncate hover:underline">{r.email}</a></div>}
                    </Td>
                    <Td className="text-[13px]">
                      {r.totals ? (
                        <>
                          <div className="font-medium whitespace-nowrap text-slate-900">{money(r.totals.total)} <span className="font-normal text-slate-500">· {sys.kw || '—'} kW</span></div>
                          <div className="max-w-[220px] truncate text-xs text-slate-500">For {r.clientName || '—'} · {count} item{count === 1 ? '' : 's'}</div>
                        </>
                      ) : (
                        // made with the first, bill-only version of the page (before the proposal maker)
                        <>
                          <div className="font-medium whitespace-nowrap text-slate-900">{r.monthlyBill ? `${money(r.monthlyBill)} bill a month` : 'Quick estimate'}</div>
                          <div className="text-xs text-slate-500">Quick estimate{r.estimate?.kw ? ` · ${r.estimate.kw} kW` : ''}{r.city ? ` · ${r.city}` : ''}</div>
                        </>
                      )}
                      <div className="text-[11px] text-slate-400">{r.refNo}{r.downloads ? ` · downloaded ${r.downloads}×` : ''}</div>
                    </Td>
                    <Td className="text-[13px]">
                      <div className="flex items-center gap-1.5 text-slate-800"><DeviceIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" /> {deviceLine(r.device)}</div>
                      <div className="text-xs text-slate-500">{[r.device?.type, r.device?.screen].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td className="text-[13px]">
                      {link ? <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><MapPin className="h-3.5 w-3.5" /> Open on map</a> : <span className="text-slate-800">{r.location?.timezone || '—'}</span>}
                      <div className="text-xs text-slate-500">{[link ? r.location?.timezone : '', r.location?.ip].filter(Boolean).join(' · ')}</div>
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500" title={formatDate(r.createdAt)}>{timeAgo(r.createdAt)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge dot tone={s.tone}>{s.label}</Badge>
                        <Select aria-label={`Status of ${r.companyName}`} value={r.status} onValue={(v) => setStatus(r, v)} className="h-8 w-32 text-xs">
                          {Object.entries(STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
                        </Select>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton icon={Eye} label={`See everything about ${r.companyName}`} onClick={() => setOpen(r.id)} />
                        <IconButton icon={Trash2} tone="danger" label={`Remove ${r.companyName}`} onClick={() => setRemoving(r)} />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {open && <Details id={open} onClose={() => setOpen(null)} onSaved={replace} />}
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} busy={busy} title={`Remove ${removing?.companyName || 'this'} free proposal?`} confirmLabel="Remove">
        <p>The proposal, the company’s details, the device and the location are deleted. Their own link to the proposal stops working. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

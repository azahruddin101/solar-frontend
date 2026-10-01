'use client';

// The page a proposal's QR code (or shared link) opens — no sign-in, read-only, built for a phone:
// the company's branding, the system and price, how long the offer holds, the 3D view, and how to get in touch.
import { Box, CalendarClock, Mail, MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { formatMoney } from '@/lib/energy';
import { invoiceTax } from '@/lib/pricing';
import { applyTheme, clearTheme } from '@/lib/theme';
import { Alert, Badge, Card, FullPageLoader, LogoChip, Table, Td, Th, Tr, buttonClass } from '../kit';

const STATUS = { draft: ['Draft', 'slate'], proposed: ['Proposal', 'blue'], won: ['Accepted', 'green'], lost: ['Closed', 'slate'] };
const date = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PublicProposal({ token }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let alive = true;
    api(`/api/public/proposals/${token}`)
      .then((data) => alive && setState({ loading: false, error: '', data }))
      .catch((e) => alive && setState({ loading: false, error: e.message, data: null }));
    return () => { alive = false; };
  }, [token]);

  // wear the company's colours
  const theme = state.data?.company?.theme;
  useEffect(() => {
    if (!theme?.primary) return undefined;
    applyTheme({ primary: theme.primary, accent: theme.accent });
    return clearTheme;
  }, [theme?.primary, theme?.accent]);

  if (state.loading) return <FullPageLoader />;
  if (state.error || !state.data) {
    return (
      <div className="grid h-dvh place-items-center bg-slate-50 px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-slate-900">This link is not available</h1>
          <p className="mt-1 text-sm text-slate-600">The proposal may have been withdrawn, or the link is no longer active. Please contact the company that sent it to you.</p>
        </div>
      </div>
    );
  }

  const { company, client, proposal: p } = state.data;
  const money = (v) => formatMoney(v, company.currency, { decimals: 2 });
  const pricing = p.pricing;
  const tax = pricing ? invoiceTax(pricing, p.total) : null;
  const [statusLabel, statusTone] = STATUS[p.status] || STATUS.proposed;
  const tiles = [
    ['System size', p.summary?.kwp ? `${p.summary.kwp.toFixed(2)} kWp` : null],
    ['Solar panels', p.summary?.panels || null],
    ['Expected energy', p.summary?.annualKwh ? `${p.summary.annualKwh.toLocaleString('en-IN')} kWh / year` : null],
    ['Total price', p.total ? money(p.total) : null],
  ].filter(([, v]) => v);

  return (
    <div className="h-dvh overflow-y-auto bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <LogoChip name={company.name} src={assetUrl(company.logo)} />
          <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-sm font-semibold">{company.name}</div>{company.tagline && <div className="truncate text-xs text-slate-600">{company.tagline}</div>}</div>
          {company.phone && <a href={`tel:${company.phone}`} className={buttonClass({ size: 'sm', variant: 'primary' })}><Phone className="h-4 w-4" /> Call</a>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-16">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone}>{statusLabel}</Badge>
            {p.validUntil && (p.expired ? <Badge tone="red"><CalendarClock className="h-3 w-3" /> Expired on {date(p.validUntil)}</Badge> : <Badge tone="amber"><CalendarClock className="h-3 w-3" /> Valid until {date(p.validUntil)}</Badge>)}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Prepared for <b className="text-slate-900">{client.name}</b> · {date(p.createdAt)}</p>
          {p.summary?.address && <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{p.summary.address}</p>}
        </section>

        {p.expired && <Alert tone="warn">This proposal has passed its validity date, so the price may have changed. Please contact {company.name} to confirm.</Alert>}

        {tiles.length > 0 && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(([k, v]) => <Card key={k} className="p-3.5"><div className="text-xs font-medium text-slate-600">{k}</div><div className="mt-1 text-base font-semibold leading-snug text-slate-900">{v}</div></Card>)}
          </section>
        )}

        {p.hasDesign && (
          <Link href={`/p/${token}/view`} className={buttonClass({ variant: 'primary', size: 'lg', className: 'w-full' })}><Box className="h-5 w-5" /> View the 3D proposal</Link>
        )}

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">Price breakdown</div>
          {!pricing?.lines?.length ? (
            <p className="px-5 py-4 text-sm text-slate-700">{p.total ? `Total price: ${money(p.total)}.` : 'The price has not been set yet.'}</p>
          ) : (
            <Table>
              <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {pricing.lines.map((l, i) => (
                  <Tr key={i}>
                    <Td><div className="font-medium text-slate-900">{l.name}</div>{l.detail && <div className="max-w-md text-xs text-slate-600">{l.detail}</div>}</Td>
                    <Td className="text-right tabular-nums">{l.qty}{l.unit ? ` ${l.unit}` : ''}</Td>
                    <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                  </Tr>
                ))}
                {tax?.rate > 0 && [['Taxable value', tax.taxable], [`CGST @ ${tax.rate / 2}%`, tax.cgst], [`SGST @ ${tax.rate / 2}%`, tax.sgst]].map(([k, v]) => (
                  <Tr key={k}><Td className="text-slate-700" colSpan={2}>{k}</Td><Td className="text-right tabular-nums">{money(v)}</Td></Tr>
                ))}
                <Tr><Td className="font-semibold" colSpan={2}>Total{pricing.withGst !== false && tax?.gst ? ' (incl. GST)' : ''}</Td><Td className="text-right font-semibold tabular-nums">{money(p.total)}</Td></Tr>
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Interested? Get in touch</h2>
          <p className="mt-1 text-sm text-slate-600">{company.name} will be happy to answer your questions and take this forward.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {company.phone && <a href={`tel:${company.phone}`} className={buttonClass({ size: 'sm' })}><Phone className="h-4 w-4" /> {company.phone}</a>}
            {company.email && <a href={`mailto:${company.email}`} className={buttonClass({ size: 'sm' })}><Mail className="h-4 w-4" /> {company.email}</a>}
          </div>
          {company.address && <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{company.address}</p>}
          {company.website && <p className="mt-1 text-xs text-slate-600">{company.website}</p>}
        </Card>
      </main>
    </div>
  );
}

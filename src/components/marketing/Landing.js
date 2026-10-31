'use client';

// Marketing site. Every claim on this page describes something the product actually does — no invented customers,
// reviews or results. The impact estimate is labelled as rough and shows how it is worked out.
//
// Design: one typeface (Geist, with Geist Mono for labels), a 12-column grid, hairline rules, white and paper
// surfaces, near-black ink and a single green. The product is shown large; the drawings are engineering sheets.
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { THEME_PRESETS, hexToRgb } from '@/lib/theme';
import { cx } from '../kit';
import { BrandMark, PRODUCT_NAME } from '../layout/Brand';
import Reveal from './Reveal';
import { ArrayPlan, ModuleDrawing, PortalPhone, SunPathDiagram } from './scenes';
import { DesignerMock, ProposalMock } from './visuals';

// the landing page's own palette (the product mocks follow it); workspaces use each company's theme
const PAGE_THEME = { '--brand': '#0F6E56', '--brand-fg': '#ffffff', '--accent': '#F5B82E', '--accent-fg': '#1c1917' };

const NAV = [['Product', '#product'], ['Design', '#design'], ['Proposals', '#proposals'], ['Operations', '#operations'], ['Portal', '#portal'], ['FAQ', '#faq']];

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c.join(',')})`;
/** CSS variables that theme <ProposalMock> — the same palette rules the real PDF cover uses. */
function proposalVars(primaryHex, accentHex) {
  const p = hexToRgb(primaryHex);
  const a = hexToRgb(accentHex);
  return { '--p': rgb(p), '--a': rgb(a), '--ink': rgb(mix(p, [6, 12, 20], 0.72)), '--deep': rgb(mix(p, [0, 0, 0], 0.45)), '--panel': rgb(mix(p, [244, 246, 248], 0.94)), '--cream': rgb(mix(a, [255, 255, 255], 0.9)) };
}

const Container = ({ className, children }) => <div className={cx('mx-auto max-w-[1200px] px-6 sm:px-10', className)}>{children}</div>;

/** "01 — Design": the small mono label that opens every section. */
const Label = ({ n, children, className }) => (
  <p className={cx('font-mono text-[11px] tracking-[0.14em] text-stone-500 uppercase', className)}>
    {n && <span className="mr-3 text-stone-950">{n}</span>}{children}
  </p>
);

const Title = ({ children, className }) => <h2 className={cx('text-[2rem] leading-[1.08] font-medium tracking-[-0.025em] text-balance text-stone-950 sm:text-[2.75rem]', className)}>{children}</h2>;
const Lede = ({ children, className }) => <p className={cx('text-[17px] leading-relaxed text-pretty text-stone-600', className)}>{children}</p>;

const PRIMARY = 'inline-flex h-11 items-center gap-2 rounded-md bg-stone-950 px-5 text-[14px] font-medium text-white transition hover:bg-stone-800';
const SECONDARY = 'inline-flex h-11 items-center gap-2 rounded-md border border-stone-300 bg-white px-5 text-[14px] font-medium text-stone-900 transition hover:border-stone-400 hover:bg-stone-50';

/* ───────────── header ───────────── */

function Header({ scrolled }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={cx('fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300', scrolled || open ? 'border-stone-200 bg-white/90 backdrop-blur-md' : 'border-transparent')}>
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${PRODUCT_NAME} home`} className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-stone-950"><BrandMark size={28} /> {PRODUCT_NAME}</Link>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="text-[14px] text-stone-600 transition hover:text-stone-950">{label}</a>)}
        </nav>
        <div className="flex items-center gap-5">
          <Link href="/login" className="hidden text-[14px] text-stone-600 hover:text-stone-950 sm:inline">Sign in</Link>
          <Link href="/login" className={cx(PRIMARY, 'h-9 px-4')}>Open workspace</Link>
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-md text-stone-800 hover:bg-stone-100 md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </Container>
      {open && (
        <nav aria-label="Mobile" className="animate-fade border-t border-stone-200 bg-white px-6 py-2 md:hidden">
          {NAV.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block border-b border-stone-100 py-3.5 text-[15px] text-stone-800 last:border-0">{label}</a>)}
          <Link href="/login" className="block py-3.5 text-[15px] text-stone-800">Sign in</Link>
        </nav>
      )}
    </header>
  );
}

/* ───────────── hero ───────────── */

const HERO_FACTS = [['3D design', 'Shading modelled hour by hour'], ['9-page proposal', 'Branded A4, accepted online'], ['Loans & billing', 'Loan steps, GST invoices, receipts'], ['25-year care', 'Installations and AMC visits']];

function Hero() {
  return (
    <section className="bg-[#f6f6f3] pt-32 pb-0 sm:pt-40">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <Reveal><Label>Software for rooftop solar companies</Label></Reveal>
            <Reveal delay={60}>
              <h1 className="mt-6 max-w-[14ch] text-[2.75rem] leading-[1.02] font-medium tracking-[-0.035em] text-balance text-stone-950 sm:text-[4rem] lg:text-[4.5rem]">
                Every solar project, from the first enquiry to the last service visit.
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <Lede className="mt-8 max-w-[46ch]">{PRODUCT_NAME} is the one workspace for solar installers: leads, clients, 3D design, proposals, loans, invoicing, installation and maintenance — with a portal where your clients follow it all.</Lede>
            </Reveal>
            <Reveal delay={180} className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={PRIMARY}>Open your workspace <ArrowRight className="h-4 w-4" /></Link>
              <a href="#product" className={SECONDARY}>What’s inside</a>
            </Reveal>
          </div>
          <Reveal delay={140} className="hidden lg:col-span-5 lg:block">
            <ModuleDrawing className="w-full" />
          </Reveal>
        </div>
        <Reveal delay={240} className="mt-16 sm:mt-20">
          <div className="rounded-t-xl border border-b-0 border-stone-300 bg-white p-1.5 shadow-[0_-1px_0_0_#fff_inset]">
            <DesignerMock flat />
          </div>
        </Reveal>
      </Container>
      <div className="border-y border-stone-200 bg-white">
        <Container>
          <dl className="grid divide-y divide-stone-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {HERO_FACTS.map(([t, d], i) => (
              <div key={t} className={cx('py-5 sm:pr-8', i > 0 && 'lg:pl-8', i % 2 === 1 && 'sm:pl-8 lg:pl-8', i >= 2 && 'sm:border-t sm:border-stone-200 lg:border-t-0')}>
                <dt className="text-[15px] font-medium text-stone-950">{t}</dt>
                <dd className="mt-0.5 text-[14px] text-stone-500">{d}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </div>
    </section>
  );
}

/* ───────────── index of modules ───────────── */

const MODULES = [
  ['Leads', 'Meta Lead Ads, Google Ads and Google Sheets connect once; walk-ins go on your own form. Statuses, priority, assignment, Excel export.'],
  ['Clients', 'Contact details, consumer number, sanctioned load, referrer and documents — bills, ID proofs, roof photos — in one record.'],
  ['3D designer', 'Satellite roof tracing, automatic panel layout around obstacles, hour-by-hour shading, a 25-year financial outlook.'],
  ['Quick proposals', 'A priced proposal from your packages and catalog in a minute, when a full design isn’t needed.'],
  ['Proposals', 'Nine A4 pages in your brand, with version history, a share link and QR code, WhatsApp sharing and online acceptance.'],
  ['Loans', 'Your own loan steps. A proposal bought on a loan follows them, with remarks the client sees.'],
  ['Billing', 'E-way bills from stock, bills paid by cash, UPI, cheque, card or transfer, and GST invoices with your own numbering.'],
  ['Inventory', 'Categories with custom attributes, batches with base, wholesale and retail prices, suppliers, serial numbers and warranties.'],
  ['Installations', 'Steps from your template, assigned by job title and priority; photos and notes from site.'],
  ['Maintenance', 'Free AMC visits scheduled from the installation date; paid visits booked by the client and assigned to technicians.'],
  ['Helpdesk', 'Clients raise requests with photos and PDFs from their portal; your team replies and tracks every thread.'],
  ['Team', 'Roles such as telecaller, accountant or supervisor — or your own. Staff see only what their role allows.'],
];

function ModuleIndex() {
  return (
    <section id="product" className="scroll-mt-16 py-24 sm:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <Label n="01">What’s inside</Label>
            <Title className="mt-5">Twelve modules, one client record.</Title>
            <Lede className="mt-5">Nothing is retyped between stages. The address from the lead becomes the site of the design, the price on the proposal becomes the invoice, the installation date schedules the maintenance.</Lede>
          </Reveal>
          <Reveal delay={100} className="lg:col-span-8">
            <ol className="grid border-t border-stone-200 sm:grid-cols-2 sm:gap-x-10">
              {MODULES.map(([name, text], i) => (
                <li key={name} className="grid grid-cols-[2.5rem_1fr] gap-x-2 border-b border-stone-200 py-5">
                  <span className="pt-0.5 font-mono text-[11px] text-stone-400">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="text-[15px] font-medium text-stone-950">{name}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-stone-600">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── design ───────────── */

const DESIGN_POINTS = [
  ['Roof from satellite', 'Search the address, trace the outline and mark parapets, tanks, staircase rooms and trees.'],
  ['Layout, automatically', 'Panels are placed in rows around every obstacle, with the clearances you set.'],
  ['Shading, hour by hour', 'Shadows from walls, obstacles and neighbouring rows are sampled through every day of the year.'],
  ['Sized from the bill', 'Start from the monthly bill or the kilowatts asked for; panel count, price and payback update as you type.'],
];

function Design() {
  return (
    <section id="design" className="scroll-mt-16 border-t border-stone-200 bg-[#f6f6f3] py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <Label n="02">Design</Label>
              <Title className="mt-5">Designed on the real roof, not a sketch.</Title>
              <Lede className="mt-5">The designer works from satellite imagery and the sun’s actual path over the site. What it draws is what gets installed.</Lede>
            </Reveal>
            <dl className="mt-10 border-t border-stone-200">
              {DESIGN_POINTS.map(([t, d], i) => (
                <Reveal key={t} delay={i * 60} className="border-b border-stone-200 py-4">
                  <dt className="text-[15px] font-medium text-stone-950">{t}</dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-stone-600">{d}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <div className="grid gap-6 lg:col-span-7">
            <Reveal delay={80} className="border border-stone-300 bg-white p-6 sm:p-8">
              <ArrayPlan className="w-full" />
            </Reveal>
            <Reveal delay={140} className="border border-stone-300 bg-white p-6 sm:p-8">
              <SunPathDiagram className="w-full" />
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── proposals ───────────── */

const PAGES = ['Cover with the 3D model', 'Summary letter and key figures', 'Panel, roof and structure details', 'Panel layout drawing', 'String layout drawing', 'Electrical design', 'Bill of materials', 'Energy and 25-year financials', 'Price, terms and sign-off'];

function Proposals() {
  const [preset, setPreset] = useState(THEME_PRESETS[1]);
  return (
    <section id="proposals" className="scroll-mt-16 border-t border-stone-200 py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
          <Reveal className="order-2 lg:order-1 lg:col-span-5">
            <div className="mx-auto max-w-[380px] lg:mx-0">
              <ProposalMock flat company={`${preset.name} Solar`} style={proposalVars(preset.primary, preset.accent)} />
            </div>
          </Reveal>
          <div className="order-1 lg:order-2 lg:col-span-6 lg:col-start-7">
            <Reveal>
              <Label n="03">Proposals</Label>
              <Title className="mt-5">Nine pages your client can sign.</Title>
              <Lede className="mt-5">Written for the homeowner and detailed enough for the engineer. Your colours, logo, signature and QR code are on every page; your terms are carried over exactly.</Lede>
            </Reveal>
            <Reveal delay={80} className="mt-8">
              <div className="flex items-center justify-between"><span className="text-[13px] text-stone-500">Preview in a palette</span><span className="font-mono text-[11px] text-stone-400 uppercase">{preset.name}</span></div>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Theme palette">
                {THEME_PRESETS.map((p) => (
                  <button key={p.name} type="button" role="radio" aria-checked={preset.name === p.name} aria-label={p.name} title={p.name} onClick={() => setPreset(p)} className={cx('flex h-7 w-7 overflow-hidden rounded-sm ring-1 ring-stone-300 ring-offset-2 transition', preset.name === p.name ? 'ring-stone-950' : 'hover:ring-stone-500')}>
                    <span className="h-full w-1/2" style={{ background: p.primary }} /><span className="h-full w-1/2" style={{ background: p.accent }} />
                  </button>
                ))}
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ol className="mt-10 border-t border-stone-200">
                {PAGES.map((p, i) => <li key={p} className="grid grid-cols-[2.5rem_1fr] border-b border-stone-200 py-3 text-[14px]"><span className="font-mono text-[11px] text-stone-400">{String(i + 1).padStart(2, '0')}</span><span className="text-stone-800">{p}</span></li>)}
              </ol>
            </Reveal>
            <Reveal delay={160} className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-stone-600">
              {['Version history', 'Share link & QR code', 'WhatsApp', 'Accept, decline or request changes'].map((t) => <span key={t}>{t}</span>)}
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── operations ───────────── */

const INSTALLS = [
  ['Mehta Textiles', '48 kW', ['done', 'done', 'done', 'current', 'todo'], 'Panel & electrical · Electrician'],
  ['Kumar residence', '5 kW', ['done', 'done', 'current', 'todo', 'todo'], 'Structure · Installer'],
  ['Green Valley School', '32 kW', ['done', 'current', 'todo', 'todo', 'todo'], 'Material procurement · Supervisor'],
];
const AMC = [['Kumar residence', 'AMC 1 · free', '14 Nov 2026', 'Scheduled'], ['Shree Hospital', 'Panel cleaning · ₹9,000', '20 Nov 2026', 'Technician assigned'], ['Mehta Textiles', 'Annual check · ₹1,500', '02 Dec 2026', 'Requested']];
const OPS_POINTS = [
  ['Installations', 'Every installation starts from your step template. Steps are assigned by job title and priority; the field team updates them with photos and notes from site, and material is issued from stock.'],
  ['Maintenance', 'Free visits are scheduled from the installation date and the client is reminded a week before. Paid visits are booked by the client — optional ones as often as they like — and assigned to technicians.'],
  ['Billing', 'Goods leave stock on an e-way bill, are paid on a bill, and GST invoices with your own numbering settle the bills. Nothing booked can be silently changed.'],
];

const Dot = ({ s }) => <span className={cx('h-1.5 w-5', s === 'done' ? 'bg-[#0F6E56]' : s === 'current' ? 'bg-[#F5B82E]' : 'bg-stone-200')} />;

function Operations() {
  return (
    <section id="operations" className="scroll-mt-16 border-t border-stone-200 bg-[#f6f6f3] py-24 sm:py-32">
      <Container>
        <Reveal className="max-w-2xl">
          <Label n="04">Operations</Label>
          <Title className="mt-5">After the sale, the work.</Title>
          <Lede className="mt-5">The part of the business that usually lives in WhatsApp groups and notebooks — tracked, assigned and visible to the client.</Lede>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal delay={60} className="border border-stone-300 bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3"><span className="text-[13px] font-medium text-stone-950">Installations</span><span className="font-mono text-[11px] text-stone-400 uppercase">3 active</span></div>
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-stone-200">
                {INSTALLS.map(([name, kw, steps, cur]) => (
                  <tr key={name}>
                    <td className="px-5 py-3.5"><div className="font-medium text-stone-950">{name}</div><div className="text-stone-500">{cur}</div></td>
                    <td className="px-3 py-3.5 text-right font-mono text-[11px] text-stone-500">{kw}</td>
                    <td className="px-5 py-3.5"><div className="flex justify-end gap-1">{steps.map((s, i) => <Dot key={i} s={s} />)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <Reveal delay={120} className="border border-stone-300 bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3"><span className="text-[13px] font-medium text-stone-950">AMC visits</span><span className="font-mono text-[11px] text-stone-400 uppercase">Next 30 days</span></div>
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-stone-200">
                {AMC.map(([name, pkg, date, st]) => (
                  <tr key={name + pkg}>
                    <td className="px-5 py-3.5"><div className="font-medium text-stone-950">{name}</div><div className="text-stone-500">{pkg}</div></td>
                    <td className="px-3 py-3.5 text-right font-mono text-[11px] whitespace-nowrap text-stone-500">{date}</td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap text-stone-700">{st}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>
        <dl className="mt-12 grid gap-x-10 border-t border-stone-200 sm:grid-cols-3">
          {OPS_POINTS.map(([t, d], i) => (
            <Reveal key={t} delay={i * 60} className="border-b border-stone-200 py-5 sm:border-b-0">
              <dt className="text-[15px] font-medium text-stone-950">{t}</dt>
              <dd className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{d}</dd>
            </Reveal>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/* ───────────── client portal ───────────── */

const PORTAL_POINTS = [
  ['Proposals', 'Read the proposal and the 3D design; accept it, decline it or ask for changes.'],
  ['Loan', 'Every step of the loan with your remarks — the bank, the amount, what comes next.'],
  ['Maintenance', 'Free visits with their dates; paid visits booked with a preferred date, again whenever needed.'],
  ['Support', 'Help requests with photos or PDFs, and your replies.'],
];

function Portal() {
  return (
    <section id="portal" className="scroll-mt-16 border-t border-stone-200 py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-6">
            <Reveal>
              <Label n="05">Client portal</Label>
              <Title className="mt-5">Your clients see where things stand.</Title>
              <Lede className="mt-5">Every client with an email address gets a sign-in. They follow their own system from proposal to loan to maintenance, and stop phoning to ask.</Lede>
            </Reveal>
            <dl className="mt-10 grid border-t border-stone-200 sm:grid-cols-2 sm:gap-x-10">
              {PORTAL_POINTS.map(([t, d], i) => (
                <Reveal key={t} delay={i * 60} className="border-b border-stone-200 py-4">
                  <dt className="text-[15px] font-medium text-stone-950">{t}</dt>
                  <dd className="mt-1 text-[14px] leading-relaxed text-stone-600">{d}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <Reveal delay={100} className="lg:col-span-5 lg:col-start-8"><PortalPhone /></Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── impact ───────────── */

// Rough figures for India, for this illustration only: ~1,450 kWh a year per kW installed, ~0.71 kg CO₂ per grid kWh
// (CEA baseline), ~21 kg CO₂ absorbed by a grown tree each year. Proposals model each site on its own.
const KWH_PER_KW = 1450;
const CO2_PER_KWH = 0.71;
const CO2_PER_TREE = 21;
const fmt = (n) => Math.round(n).toLocaleString('en-IN');

function Impact() {
  const [kw, setKw] = useState(10);
  const kwh = kw * KWH_PER_KW;
  const co2 = (kwh * CO2_PER_KWH) / 1000;
  const rows = [
    ['Generation', fmt(kwh), 'kWh / year'],
    ['CO₂ avoided', co2.toFixed(1), 't / year'],
    ['Equivalent trees', fmt((kwh * CO2_PER_KWH) / CO2_PER_TREE), 'growing all year'],
    ['Over 25 years', fmt(co2 * 25), 't CO₂'],
  ];
  return (
    <section className="border-t border-stone-200 bg-[#f6f6f3] py-24 sm:py-32">
      <Container>
        <div className="grid gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Label n="06">Why it matters</Label>
            <Title className="mt-5">Each system you install keeps working for decades.</Title>
            <Lede className="mt-5">Move the slider to size a rooftop and see roughly what it does for the grid and the air.</Lede>
            <p className="mt-6 text-[13px] leading-relaxed text-stone-500">Estimate for India: {fmt(KWH_PER_KW)} kWh a year per kW, {CO2_PER_KWH} kg CO₂ per grid kWh, {CO2_PER_TREE} kg CO₂ absorbed by a tree each year. Your proposals model each site’s own sunlight and shading.</p>
          </Reveal>
          <Reveal delay={100} className="border border-stone-300 bg-white lg:col-span-7">
            <div className="flex items-end justify-between border-b border-stone-200 px-6 py-5">
              <label htmlFor="impact-kw" className="text-[13px] text-stone-500">System size</label>
              <div className="font-mono text-4xl tracking-tight text-stone-950 tabular-nums">{kw} <span className="text-base text-stone-500">kW</span></div>
            </div>
            <div className="px-6 py-5">
              <input id="impact-kw" type="range" min={1} max={100} value={kw} onChange={(e) => setKw(Number(e.target.value))} className="w-full accent-stone-950" />
              <div className="mt-1 flex justify-between font-mono text-[11px] text-stone-400 uppercase"><span>1 kW · a home</span><span>100 kW · a factory roof</span></div>
            </div>
            <dl className="divide-y divide-stone-200 border-t border-stone-200">
              {rows.map(([k, v, u]) => (
                <div key={k} className="flex items-baseline justify-between px-6 py-3.5">
                  <dt className="text-[14px] text-stone-600">{k}</dt>
                  <dd className="font-mono text-[15px] text-stone-950 tabular-nums">{v} <span className="text-stone-400">{u}</span></dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── access ───────────── */

const ROLES = [
  ['Platform admin', ['Creates solar companies', 'Plans, limits and subscriptions', 'Upgrade requests', 'Platform support']],
  ['Solar company', ['Every module and setting', 'Brand, masters, integrations', 'Staff accounts and roles', 'Pipeline dashboard']],
  ['Staff', ['What their role allows', 'Their leads, steps and visits', 'Photos and notes from site', 'Works on a phone']],
  ['Client', ['Proposals and acceptance', 'Loan progress', 'AMC visits and bookings', 'Help requests']],
];

function Access() {
  return (
    <section className="border-t border-stone-200 py-24 sm:py-32">
      <Container>
        <Reveal className="max-w-2xl">
          <Label n="07">Access</Label>
          <Title className="mt-5">The right view for each person.</Title>
          <Lede className="mt-5">Each company works in its own private workspace; one company can never see another’s clients, prices or designs.</Lede>
        </Reveal>
        <div className="mt-12 grid border-t border-stone-200 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map(([title, points], i) => (
            <Reveal key={title} delay={i * 60} className={cx('border-b border-stone-200 py-6 lg:border-b-0', i > 0 && 'lg:border-l lg:border-stone-200 lg:pl-8', i < 3 && 'lg:pr-8')}>
              <h3 className="text-[15px] font-medium text-stone-950">{title}</h3>
              <ul className="mt-4 space-y-2 text-[14px] text-stone-600">{points.map((p) => <li key={p}>{p}</li>)}</ul>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ───────────── FAQ ───────────── */

const FAQ = [
  ['How do I get a workspace?', 'Company workspaces are created by the platform administrator, who gives you a sign-in email and a temporary password. You can change the password after your first sign-in.'],
  ['Can my leads come in automatically?', 'Yes. Connect Meta Lead Ads, Google Ads or a Google Sheet once and new leads arrive in your workspace on their own. You can still add walk-ins by hand with your own lead form.'],
  ['Do my clients get an account?', 'Every client with an email address can get a portal sign-in. There they read their proposals, respond to them, follow their loan, book maintenance visits and ask for help. Clients without one simply receive the PDF.'],
  ['How do loans work?', 'You set your own loan steps once. Mark a proposal as bought on a loan and it starts on those steps; your team updates each one with a remark, and the client sees the progress in their portal.'],
  ['How accurate are the energy figures?', 'Sunlight is modelled for the building’s location and calibrated with Google’s Solar API where it has data. Shading from parapets, tanks, trees and neighbouring panel rows is calculated hour by hour. Figures are indicative and should be confirmed with a site visit — the proposal says so too.'],
  ['Can my staff only see their own work?', 'Yes. Staff always see the leads, installation steps and AMC visits assigned to them. Anything more — finances, inventory, loans, every installation — is granted through roles you define.'],
  ['Can other companies see my data?', 'No. Every client, product, design and image belongs to one company and is only ever loaded for that company’s sign-in.'],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-t border-stone-200 bg-[#f6f6f3] py-24 sm:py-32">
      <Container>
        <div className="grid gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-4"><Label n="08">Questions</Label><Title className="mt-5">Good to know.</Title></Reveal>
          <div className="border-t border-stone-200 lg:col-span-8">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-b border-stone-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[16px] font-medium text-stone-950 [&::-webkit-details-marker]:hidden">
                  {q} <ChevronDown className="h-4 w-4 shrink-0 text-stone-400 transition group-open:rotate-180" />
                </summary>
                <p className="max-w-[64ch] pb-6 text-[15px] leading-relaxed text-stone-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ───────────── CTA + footer ───────────── */

function Cta() {
  return (
    <section className="border-t border-stone-200 py-20 sm:py-28">
      <Container>
        <Reveal className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <Title>Ready before the next client calls.</Title>
            <Lede className="mt-4">Sign in to your company workspace, or ask your platform administrator to set one up.</Lede>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
            <Link href="/login" className={PRIMARY}>Sign in <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer() {
  const cols = [
    ['Product', [['What’s inside', '#product'], ['Design', '#design'], ['Proposals', '#proposals'], ['Operations', '#operations'], ['Client portal', '#portal'], ['FAQ', '#faq']]],
    ['Workspace', [['Sign in', '/login'], ['Company dashboard', '/dashboard'], ['Staff workspace', '/agent'], ['Client portal', '/portal']]],
  ];
  return (
    <footer className="border-t border-stone-200 bg-[#f6f6f3]">
      <Container className="grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-6">
          <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-stone-950"><BrandMark size={28} /> {PRODUCT_NAME}</span>
          <p className="mt-4 max-w-[40ch] text-[14px] leading-relaxed text-stone-500">The workspace for rooftop solar companies — leads, design, proposals, loans, billing, installations and maintenance.</p>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title} className="md:col-span-3">
            <div className="font-mono text-[11px] tracking-[0.14em] text-stone-500 uppercase">{title}</div>
            <ul className="mt-4 space-y-2.5 text-[14px]">{links.map(([label, href]) => <li key={label}>{href.startsWith('#') ? <a href={href} className="text-stone-700 hover:text-stone-950">{label}</a> : <Link href={href} className="text-stone-700 hover:text-stone-950">{label}</Link>}</li>)}</ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-stone-200"><Container className="flex flex-wrap items-center justify-between gap-3 py-5 font-mono text-[11px] tracking-wide text-stone-500 uppercase"><span>© {new Date().getFullYear()} {PRODUCT_NAME}</span><span>Made for solar installers</span></Container></div>
    </footer>
  );
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  // the page scrolls inside this container (the app shell keeps <body> fixed)
  const [root, setRoot] = useState(null);
  useEffect(() => {
    if (!root) return undefined;
    const onScroll = () => setScrolled(root.scrollTop > 24);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [root]);

  return (
    <div ref={setRoot} style={PAGE_THEME} className="h-dvh overflow-x-hidden overflow-y-auto scroll-smooth bg-white text-stone-900 antialiased">
      <Header scrolled={scrolled} />
      <main>
        <Hero />
        <ModuleIndex />
        <Design />
        <Proposals />
        <Operations />
        <Portal />
        <Impact />
        <Access />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

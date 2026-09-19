'use client';

// Marketing site. Every claim on this page describes something the product actually does —
// no invented customers, reviews or numbers.
import { ArrowRight, BadgeCheck, Box, Building2, Check, ChevronDown, FileSpreadsheet, FileText, Gauge, LineChart, MapPin, Menu, Palette, PanelsTopLeft, PenLine, QrCode, ShieldCheck, Signature, Sun, SunMedium, Users, Wallet, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { THEME_PRESETS, hexToRgb } from '@/lib/theme';
import { buttonClass, cx } from '../kit';
import { BrandLogo, PRODUCT_NAME } from '../layout/Brand';
import Reveal from './Reveal';
import { DesignerMock, ProposalMock, RoofIllustration } from './visuals';

const NAV = [['Features', '#features'], ['How it works', '#how'], ['Your brand', '#brand'], ['FAQ', '#faq']];

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c.join(',')})`;
/** CSS variables that theme <ProposalMock> — the same palette rules the real PDF cover uses. */
function proposalVars(primaryHex, accentHex) {
  const p = hexToRgb(primaryHex);
  const a = hexToRgb(accentHex);
  return { '--p': rgb(p), '--a': rgb(a), '--ink': rgb(mix(p, [6, 12, 20], 0.72)), '--deep': rgb(mix(p, [0, 0, 0], 0.45)), '--panel': rgb(mix(p, [244, 246, 248], 0.94)), '--cream': rgb(mix(a, [255, 255, 255], 0.9)) };
}

function SectionHeading({ eyebrow, title, text, center, dark }) {
  return (
    <Reveal className={cx('max-w-2xl', center && 'mx-auto text-center')}>
      <p className={cx('text-sm font-semibold tracking-wide', dark ? 'text-accent' : 'text-brand')}>{eyebrow}</p>
      <h2 className={cx('mt-3 text-3xl leading-[1.12] font-semibold tracking-tight text-balance sm:text-[2.6rem]', dark ? 'text-white' : 'text-slate-950')}>{title}</h2>
      {text && <p className={cx('mt-4 text-lg leading-relaxed text-pretty', dark ? 'text-slate-400' : 'text-slate-600')}>{text}</p>}
    </Reveal>
  );
}

/* ───────────── header ───────────── */

function Header({ scrolled }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={cx('sticky top-0 z-40 transition-all duration-300', scrolled || open ? 'border-b border-slate-200/70 bg-white/80 backdrop-blur-xl' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label={`${PRODUCT_NAME} home`}><BrandLogo /></Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonClass({ variant: 'primary', className: 'rounded-full px-5' })}>Sign in</Link>
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full text-slate-700 hover:bg-slate-100 md:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="animate-fade border-t border-slate-200 px-5 py-3 md:hidden">
          {NAV.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-base font-medium text-slate-700 hover:bg-slate-100">{label}</a>)}
        </nav>
      )}
    </header>
  );
}

/* ───────────── hero ───────────── */

function FloatingCard({ icon: Icon, label, value, className, accent }) {
  return (
    <div className={cx('absolute hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-xl shadow-slate-900/10 backdrop-blur lg:flex', className)}>
      <span className={cx('grid h-10 w-10 place-items-center rounded-xl', accent ? 'bg-accent text-accent-fg' : 'bg-brand text-brand-fg')}><Icon className="h-5 w-5" /></span>
      <div><div className="text-xs text-slate-500">{label}</div><div className="text-base leading-tight font-semibold text-slate-950">{value}</div></div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="mask-radial absolute inset-0 bg-grid" />
      <div aria-hidden className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-brand opacity-[0.13] blur-[110px]" />
      <div aria-hidden className="absolute top-40 -right-32 h-[380px] w-[380px] rounded-full bg-accent opacity-[0.16] blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-5 pt-14 pb-10 text-center sm:px-8 sm:pt-20">
        <Reveal>
          <a href="#brand" className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 py-1.5 pr-4 pl-1.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300">
            <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-fg">New</span> Proposals in your own brand colours <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </a>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="mx-auto mt-7 max-w-4xl text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.03em] text-balance text-slate-950 sm:text-6xl lg:text-7xl">
            From a rooftop to a <span className="bg-gradient-to-r from-brand via-brand to-accent bg-clip-text text-transparent">signed solar proposal</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-slate-600 sm:text-xl">{PRODUCT_NAME} is the workspace for solar installers: keep your clients, design their roof in 3D, and hand over a priced, branded PDF — in minutes, not days.</p>
        </Reveal>
        <Reveal delay={240} className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/login" className={buttonClass({ variant: 'primary', size: 'lg', className: 'rounded-full px-7 shadow-lg shadow-brand/25' })}>Open your workspace <ArrowRight className="h-4 w-4" /></Link>
          <a href="#how" className={buttonClass({ size: 'lg', className: 'rounded-full px-7' })}>See how it works</a>
        </Reveal>
        <Reveal delay={300}>
          <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            {['No software to install', 'Clients need no login', 'A4 proposal, ready to print'].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-brand" /> {t}</li>)}
          </ul>
        </Reveal>

        <Reveal delay={200} className="relative mx-auto mt-14 max-w-5xl">
          <DesignerMock />
          <FloatingCard icon={Wallet} label="Year-1 savings" value="₹1,31,000" className="animate-float top-44 -left-24 xl:-left-32" />
          <FloatingCard icon={SunMedium} label="Shading loss" value="0.4 %" accent className="animate-float-slow -right-24 bottom-10 xl:-right-44" />
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── facts strip ───────────── */

const FACTS = [['3 steps', 'Location, roof, solar plan'], ['9 pages', 'In every A4 proposal'], ['25 years', 'Savings and payback outlook'], ['Hour by hour', 'Shading from walls, tanks and trees']];

function Facts() {
  return (
    <section aria-label="At a glance" className="border-y border-slate-200 bg-white">
      <dl className="mx-auto grid max-w-7xl grid-cols-2 px-5 sm:px-8 lg:grid-cols-4">
        {FACTS.map(([value, label], i) => (
          <Reveal key={value} delay={i * 70} className={cx('px-2 py-8 text-center sm:py-10', i % 2 === 1 && 'border-l border-slate-200', i >= 2 && 'border-t border-slate-200 lg:border-t-0', i === 2 && 'lg:border-l')}>
            <dt className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{value}</dt>
            <dd className="mt-1 text-sm text-slate-500">{label}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/* ───────────── features (bento) ───────────── */

function Bento({ className, icon: Icon, title, text, children, delay }) {
  return (
    <Reveal delay={delay} className={cx('group relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5', className)}>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-brand-fg"><Icon className="h-5 w-5" /></span>
      <h3 className="mt-5 text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{text}</p>
      <div className="mt-auto pt-6">{children}</div>
    </Reveal>
  );
}

function Features() {
  const bars = [46, 58, 74, 86, 100, 90, 72, 68, 80, 74, 56, 44];
  return (
    <section id="features" className="scroll-mt-20 bg-slate-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading eyebrow="Everything in one place" title="The whole job, from first call to signature" text="Stop stitching together spreadsheets, drawing tools and document templates. One workspace carries a client from enquiry to a proposal they can sign." />
        <div className="mt-14 grid gap-5 md:grid-cols-6">
          <Bento className="md:col-span-4" icon={Box} title="Design on the real roof, in 3D" text="Find the building on satellite imagery, trace the roof and its obstacles, and panels are arranged for you — around water tanks, staircase rooms and parapets. Drag the sun through the day to see every shadow.">
            <div className="relative -mb-7 h-56 overflow-hidden rounded-t-2xl bg-gradient-to-br from-sky-100 via-slate-100 to-emerald-50 sm:h-64"><div className="absolute inset-0 bg-grid opacity-60" /><RoofIllustration className="relative mx-auto h-full w-full max-w-md" /></div>
          </Bento>
          <Bento className="md:col-span-2" delay={80} icon={Gauge} title="Size it your way" text="Start from the client’s monthly bill or from the kilowatts they asked for. The panel count, price and payback update as you type.">
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-center text-xs font-medium"><span className="rounded-md bg-white py-1.5 text-slate-900 shadow-sm">Monthly bill</span><span className="py-1.5 text-slate-500">Kilowatt (kW)</span></div>
              <div className="flex items-center justify-between rounded-lg border-2 border-brand px-3 py-2 font-semibold">6,500 <span className="text-xs font-medium text-slate-400">INR</span></div>
              <p className="text-xs text-slate-500">About 684 units/month → <b className="text-slate-800">24 panels</b> of 540 W</p>
            </div>
          </Bento>
          <Bento className="md:col-span-2" delay={0} icon={Users} title="Clients, organised" text="Name, email, phone and address in one list, with every design filed under the right person. Your clients never need an account.">
            <ul className="space-y-2">
              {[['RK', 'Ravi Kumar', '2 designs'], ['GV', 'Green Valley School', '1 design'], ['MT', 'Mehta Textiles', '1 design']].map(([i, n, d]) => <li key={n} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{i}</span><span className="flex-1 truncate font-medium text-slate-800">{n}</span><span className="text-xs text-slate-400">{d}</span></li>)}
            </ul>
          </Bento>
          <Bento className="md:col-span-2" delay={80} icon={PanelsTopLeft} title="Your own product catalog" text="List the panels you sell — brand, model, watt, manufacture year, warranty and your price — plus mounting poles per foot.">
            <ul className="space-y-2 text-sm">
              {[['Waaree', 'Ahnay 540 W', '25 yr'], ['Adani Solar', 'TOPCon 575 W', '30 yr']].map(([b, m, w]) => <li key={b} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"><span className="min-w-0"><span className="block truncate font-medium text-slate-800">{b}</span><span className="block truncate text-xs text-slate-400">{m}</span></span><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">{w} warranty</span></li>)}
              <li className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-slate-600"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /> Import the whole list from Excel</li>
            </ul>
          </Bento>
          <Bento className="md:col-span-2" delay={160} icon={LineChart} title="Numbers clients understand" text="Monthly generation, year-one savings, payback and a 25-year outlook — with shading and panel ageing already accounted for.">
            <div className="flex h-16 items-end gap-1">{bars.map((h, i) => <span key={i} className="flex-1 rounded-t bg-accent/85" style={{ height: `${h}%` }} />)}</div>
          </Bento>
        </div>
      </div>
    </section>
  );
}

/* ───────────── how it works ───────────── */

const STEPS = [
  [Users, 'Add the client', 'Save their name, email and address once. Pick them whenever you start a design.'],
  [MapPin, 'Find the building', 'Search the address and confirm the rooftop on satellite imagery.'],
  [PenLine, 'Mark the roof', 'Trace the outline, then drag over tanks, staircase rooms and trees.'],
  [FileText, 'Download the proposal', 'Choose the panel, check the price and export a branded A4 PDF.'],
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading center eyebrow="How it works" title="A proposal in four steps" text="Most designs take a few minutes. Everything is saved as you go, so you can pick up where you left off." />
        <ol className="relative mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <div aria-hidden className="absolute top-7 right-[12.5%] left-[12.5%] hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block" />
          {STEPS.map(([Icon, title, text], i) => (
            <Reveal as="li" key={title} delay={i * 90} className="relative text-center">
              <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/20"><Icon className="h-6 w-6" /><span className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg ring-4 ring-white">{i + 1}</span></span>
              <h3 className="mt-6 text-lg font-semibold text-slate-950">{title}</h3>
              <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-relaxed text-slate-600">{text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── your brand (interactive) ───────────── */

const BRAND_POINTS = [[Palette, 'Theme colours', 'Across your workspace and every page of the PDF.'], [Sun, 'Your logo', 'On the cover, page headers and the sidebar.'], [Signature, 'E-signature', 'Signed by your director on the acceptance page.'], [QrCode, 'QR code', 'For UPI payment, your website or a contact card.']];

function BrandSection() {
  const [preset, setPreset] = useState(THEME_PRESETS[1]);
  return (
    <section id="brand" className="relative scroll-mt-20 overflow-hidden bg-slate-950 py-24 text-white sm:py-32">
      <div aria-hidden className="absolute -top-40 right-0 h-[480px] w-[480px] rounded-full opacity-30 blur-[130px] transition-colors duration-700" style={{ background: preset.primary }} />
      <div aria-hidden className="absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full opacity-20 blur-[130px] transition-colors duration-700" style={{ background: preset.accent }} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <SectionHeading dark eyebrow="Your brand, not ours" title="Every proposal looks like it came from your design team" text="Set your colours once. The cover, tables, charts and sign-off all follow — and your client sees only your company." />
          <Reveal delay={120} className="mt-9">
            <div className="text-sm font-medium text-slate-300">Try a palette</div>
            <div className="mt-3 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Theme palette">
              {THEME_PRESETS.map((p) => (
                <button key={p.name} type="button" role="radio" aria-checked={preset.name === p.name} aria-label={p.name} title={p.name} onClick={() => setPreset(p)} className={cx('flex h-10 w-10 overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-slate-950 transition', preset.name === p.name ? 'scale-110 ring-white' : 'ring-transparent hover:ring-white/40')}>
                  <span className="h-full w-1/2" style={{ background: p.primary }} /><span className="h-full w-1/2" style={{ background: p.accent }} />
                </button>
              ))}
            </div>
          </Reveal>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {BRAND_POINTS.map(([Icon, title, text], i) => (
              <Reveal as="li" key={title} delay={i * 70} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10"><Icon className="h-5 w-5 text-accent" /></span>
                <div><div className="font-medium">{title}</div><div className="mt-0.5 text-sm leading-relaxed text-slate-400">{text}</div></div>
              </Reveal>
            ))}
          </ul>
        </div>
        <Reveal delay={150} className="relative mx-auto w-full max-w-[420px]">
          <ProposalMock company={`${preset.name} Solar`} style={proposalVars(preset.primary, preset.accent)} />
          <div className="animate-float absolute -bottom-5 -left-6 hidden items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-slate-900 shadow-2xl sm:flex"><FileText className="h-5 w-5" style={{ color: preset.primary }} /><div className="text-sm leading-tight"><b className="block">ravi-kumar_proposal.pdf</b><span className="text-xs text-slate-500">9 pages · A4</span></div></div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────── inside the proposal ───────────── */

const PAGES = ['Cover with the 3D model', 'Summary letter and key figures', 'Panel, roof and structure details', 'Panel layout drawing', 'String layout drawing', 'Electrical design', 'Bill of materials', 'Energy and 25-year financials', 'Price, your terms and sign-off'];

function ProposalContents() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <SectionHeading eyebrow="Inside the PDF" title="Nine pages that answer every question" text="Written for the homeowner, detailed enough for the engineer. Your terms and conditions are formatted in a rich text editor and carried over exactly." />
          <Reveal delay={100}><Link href="/login" className={buttonClass({ variant: 'primary', size: 'lg', className: 'mt-9 rounded-full px-7' })}>Create a proposal <ArrowRight className="h-4 w-4" /></Link></Reveal>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2">
          {PAGES.map((p, i) => (
            <Reveal as="li" key={p} delay={i * 45} className={cx('flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 transition hover:border-slate-300 hover:shadow-md', i === PAGES.length - 1 && 'sm:col-span-2')}>
              <span className="text-2xl font-semibold text-slate-300 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <span className="text-[15px] font-medium text-slate-800">{p}</span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────── roles ───────────── */

const ROLES = [
  [ShieldCheck, 'Platform admin', 'Runs the platform', ['Adds solar companies', 'Sets plans and usage limits', 'Turns features on or off', 'Suspends access when needed']],
  [Building2, 'Solar company', 'Does the work', ['Profile, colours, logo, signature, QR', 'Own panel and pole catalog with prices', 'Clients and their designs', 'Branded proposals'], true],
  [BadgeCheck, 'Client', 'Receives the proposal', ['No account or password', 'Details kept by the company', 'Named on every page', 'Signs the acceptance block']],
];

function Roles() {
  return (
    <section className="bg-slate-50 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading center eyebrow="Built for teams" title="The right access for everyone" text="Each company works in its own private workspace. One company can never see another’s clients, prices or designs." />
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {ROLES.map(([Icon, title, sub, points, featured], i) => (
            <Reveal key={title} delay={i * 90} className={cx('rounded-3xl border p-8', featured ? 'border-slate-950 bg-slate-950 text-white shadow-2xl shadow-slate-900/20' : 'border-slate-200 bg-white')}>
              <span className={cx('grid h-12 w-12 place-items-center rounded-2xl', featured ? 'bg-accent text-accent-fg' : 'bg-brand-soft text-brand')}><Icon className="h-6 w-6" /></span>
              <h3 className="mt-6 text-xl font-semibold">{title}</h3>
              <p className={cx('mt-1 text-sm', featured ? 'text-slate-400' : 'text-slate-500')}>{sub}</p>
              <ul className="mt-6 space-y-3">{points.map((p) => <li key={p} className={cx('flex gap-2.5 text-[15px]', featured ? 'text-slate-200' : 'text-slate-700')}><Check className={cx('mt-0.5 h-4 w-4 shrink-0', featured ? 'text-accent' : 'text-brand')} /> {p}</li>)}</ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── FAQ ───────────── */

const FAQ = [
  ['How do I get a workspace?', 'Company workspaces are created by the platform administrator, who gives you a sign-in email and a temporary password. You can change the password after your first sign-in.'],
  ['Do my clients need to create an account?', 'No. You keep their name, email, phone and address in your workspace, and they simply receive the PDF proposal from you.'],
  ['How accurate are the energy figures?', 'Sunlight is modelled for the building’s location and calibrated with Google’s Solar API where it has data. Shading from parapets, raised roofs, tanks, trees and neighbouring panel rows is calculated hour by hour. Figures are indicative and should be confirmed with a site visit — the proposal says so too.'],
  ['Can I use my own panels and prices?', 'Yes. Your catalog holds the panels you sell with brand, model, watt, manufacture year, warranty and price, plus mounting poles priced per foot. You can import panels from an Excel sheet.'],
  ['Can other companies see my data?', 'No. Every client, product, design and image belongs to one company and is only ever loaded for that company’s sign-in.'],
  ['What paper size is the proposal?', 'Every page is A4 portrait, so it prints cleanly and reads well on a phone.'],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <SectionHeading center eyebrow="Questions" title="Good to know" />
        <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[17px] font-medium text-slate-950 [&::-webkit-details-marker]:hidden">
                {q} <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition duration-300 group-open:rotate-180" />
              </summary>
              <p className="-mt-1 pr-10 pb-6 text-[15px] leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────── CTA + footer ───────────── */

function Cta() {
  return (
    <section className="px-5 pb-24 sm:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-16 text-center text-white sm:px-16 sm:py-24">
        <div aria-hidden className="mask-fade-b absolute inset-0 bg-grid opacity-[0.35] invert" />
        <div aria-hidden className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-brand opacity-50 blur-[110px]" />
        <div aria-hidden className="absolute right-1/4 -bottom-32 h-80 w-80 rounded-full bg-accent opacity-30 blur-[110px]" />
        <Zap aria-hidden className="relative mx-auto h-9 w-9 text-accent" />
        <h2 className="relative mx-auto mt-5 max-w-2xl text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">Be ready before your next client calls</h2>
        <p className="relative mx-auto mt-5 max-w-xl text-lg text-slate-400">Sign in to your company workspace, or ask your platform administrator to set one up.</p>
        <Link href="/login" className={buttonClass({ variant: 'primary', size: 'lg', className: 'relative mt-9 rounded-full px-8 shadow-lg shadow-brand/30' })}>Sign in <ArrowRight className="h-4 w-4" /></Link>
      </Reveal>
    </section>
  );
}

function Footer() {
  const cols = [['Product', [['Features', '#features'], ['How it works', '#how'], ['Your brand', '#brand'], ['FAQ', '#faq']]], ['Workspace', [['Sign in', '/login'], ['Company dashboard', '/dashboard'], ['Admin console', '/admin']]]];
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <BrandLogo />
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-slate-500">Rooftop solar design and branded proposals for installers — clients, 3D design, pricing and PDF in one workspace.</p>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <div className="text-sm font-semibold text-slate-950">{title}</div>
            <ul className="mt-4 space-y-3 text-[15px]">{links.map(([label, href]) => <li key={label}>{href.startsWith('#') ? <a href={href} className="text-slate-500 hover:text-slate-950">{label}</a> : <Link href={href} className="text-slate-500 hover:text-slate-950">{label}</Link>}</li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-slate-200"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500 sm:px-8"><span>© {new Date().getFullYear()} {PRODUCT_NAME}</span><span>Made for solar installers</span></div></div>
    </footer>
  );
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  // the page scrolls inside this container (the app shell keeps <body> fixed)
  const [root, setRoot] = useState(null);
  useEffect(() => {
    if (!root) return undefined;
    const onScroll = () => setScrolled(root.scrollTop > 12);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [root]);

  return (
    <div ref={setRoot} className="h-dvh overflow-x-hidden overflow-y-auto scroll-smooth bg-white text-slate-900">
      <Header scrolled={scrolled} />
      <main>
        <Hero />
        <Facts />
        <Features />
        <HowItWorks />
        <BrandSection />
        <ProposalContents />
        <Roles />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

'use client';

import { ArrowRight, ChevronDown, Menu, ShieldCheck, Sun, X } from 'lucide-react';
import Lenis from 'lenis';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { hexToRgb } from '@/lib/theme';
import { cx } from '../kit';
import { BrandMark, PRODUCT_NAME } from '../layout/Brand';
import Reveal from './Reveal';
import { PortalPhone } from './scenes';
import { ProposalMock } from './visuals';

// the landing page's own palette (the product mocks follow it); workspaces use each company's theme
const BRAND = '#1D4ED8';
const ACCENT = '#F5B82E';
const PAGE_THEME = { '--brand': BRAND, '--brand-fg': '#ffffff', '--accent': ACCENT, '--accent-fg': '#1c1917' };

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const rgb = (c) => `rgb(${c.join(',')})`;
/** CSS variables that theme <ProposalMock>: the same palette rules the real PDF cover uses. */
function proposalVars(primaryHex, accentHex) {
  const p = hexToRgb(primaryHex);
  const a = hexToRgb(accentHex);
  return { '--p': rgb(p), '--a': rgb(a), '--ink': rgb(mix(p, [6, 12, 20], 0.72)), '--deep': rgb(mix(p, [0, 0, 0], 0.45)), '--panel': rgb(mix(p, [244, 246, 248], 0.94)), '--cream': rgb(mix(a, [255, 255, 255], 0.9)) };
}

// The page's own styles: what Reveal fades, the marquee, and the pieces the scroll position moves.
const STYLES = `
.lp .reveal { opacity: 0; transform: translateY(26px); transition: opacity .8s cubic-bezier(.22,1,.36,1), transform .8s cubic-bezier(.22,1,.36,1); transition-delay: var(--reveal-delay, 0ms); will-change: opacity, transform; }
.lp .reveal.is-visible { opacity: 1; transform: none; }
.lp.lenis.lenis-smooth { scroll-behavior: auto !important; }
.lp.lenis.lenis-stopped { overflow: clip; }
.lp-progress { transform: scaleX(var(--lp-progress, 0)); transform-origin: 0 50%; }
.lp-glow { transform: translate3d(0, calc(var(--lp-y, 0) * .25px), 0); }
.lp-line { transform: scaleX(var(--lp-steps, 0)); transform-origin: 0 50%; }
.lp-marquee { animation: lp-marquee 48s linear infinite; }
.lp-marquee-wrap:hover .lp-marquee { animation-play-state: paused; }
@keyframes lp-marquee { to { transform: translateX(-50%); } }
.lp-faq { grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .45s cubic-bezier(.22,1,.36,1), opacity .35s ease; }
.lp-faq.is-open { grid-template-rows: 1fr; opacity: 1; }
.lp-card { transition: transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s, border-color .35s; }
.lp-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -18px rgba(15,23,42,.22); border-color: color-mix(in oklab, var(--brand) 35%, white); }
.lp-art { transition: transform .45s cubic-bezier(.22,1,.36,1); }
.lp-card:hover .lp-art { transform: scale(1.08) rotate(-3deg); }
.lp-float { animation: lp-float 7s ease-in-out infinite; }
@keyframes lp-float { 50% { transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) {
  .lp .reveal { opacity: 1; transform: none; transition: none; }
  .lp-glow { transform: none; }
  .lp-marquee, .lp-float { animation: none; }
  .lp-faq { transition: none; }
  .lp-line { transform: none; }
}
`;

const NAV = [['Features', '#features'], ['Design', '#design'], ['Proposals', '#proposals'], ['Client portal', '#portal'], ['How it works', '#how'], ['FAQ', '#faq']];

/**
 * A feature's picture. The drawings are plain SVG files kept in public/landing/features (one per feature, named
 * by the slug used in FEATURES and STRIP below).
 */
// eslint-disable-next-line @next/next/no-img-element -- small static SVGs: nothing for the image optimiser to do
const FeatureArt = ({ name, className }) => <img src={`/landing/features/${name}.svg`} alt="" width={64} height={64} loading="lazy" decoding="async" className={className} />;

const Frame = ({ title, className, children }) => (
  <div className={cx('overflow-hidden rounded-xl border border-slate-200 bg-white', className)}>
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
      <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-200">{title}</span>
    </div>
    {children}
  </div>
);

// The tutorial video (public/landing/tutorial.mp4) is made of real screens of the designer, one step after
// another. `at`: the second each step starts at, so the steps under the video follow it and can be clicked.
const TOUR = [
  { at: 0, name: 'Location', text: 'Find the address, then click the corners of the roof on the satellite picture.' },
  { at: 6.2, name: 'Building', text: 'Pick the house that looks like the building, and how many floors it has.' },
  { at: 11, name: 'Package', text: 'Choose a ready package, or your own panel and mounting structure.' },
  { at: 13.6, name: 'Panels', text: 'Fill the roof in one tap, or set the number of panels. Check it in the plan view.' },
  { at: 20.4, name: 'Strings', text: 'Strings are worked out for the inverter. Change them only if you want to.' },
  { at: 23.6, name: 'Products', text: 'Every product and its price, ready to adjust for this customer.' },
  { at: 26.8, name: 'Proposal', text: 'Energy, savings and price. Download the branded PDF or share it on WhatsApp.' },
];

/**
 * A walk through the designer, step by step: the video plays silently on a loop while it is on screen, the
 * step under it lights up as the video reaches it, and clicking a step jumps there. With "reduce motion" on it
 * does not start by itself; the steps still work.
 */
function Tutorial({ className }) {
  const ref = useRef(null);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const onTime = () => {
      const t = v.currentTime;
      let k = 0;
      TOUR.forEach((x, i) => { if (t >= x.at - 0.05) k = i; });
      setStep(k);
      const end = TOUR[k + 1]?.at ?? (v.duration || 30.6);
      setProgress(Math.max(0, Math.min(1, (t - TOUR[k].at) / (end - TOUR[k].at))));
    };
    v.addEventListener('timeupdate', onTime);
    let io;
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      // play only while it is on screen
      io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.25 });
      io.observe(v);
    }
    return () => {
      v.removeEventListener('timeupdate', onTime);
      io?.disconnect();
    };
  }, []);
  const go = (i) => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = TOUR[i].at + 0.05;
    setStep(i);
    v.play().catch(() => {});
  };
  return (
    <div className={className}>
      <Frame title={`${PRODUCT_NAME} · Designer · Step ${step + 1} of ${TOUR.length}: ${TOUR[step].name}`}>
        <video ref={ref} muted loop playsInline preload="metadata" poster="/landing/tutorial-poster.jpg" aria-label="A walk through the designer, from marking the roof to the finished proposal" className="block aspect-[1456/826] w-full bg-slate-100 object-cover">
          <source src="/landing/tutorial.mp4" type="video/mp4" />
        </video>
      </Frame>
      <div role="tablist" aria-label="Steps of the designer" className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
        {TOUR.map((x, i) => (
          <button key={x.name} type="button" role="tab" aria-selected={i === step} onClick={() => go(i)} className={cx('relative overflow-hidden rounded-lg border px-2 py-1.5 text-left transition', i === step ? 'border-brand bg-white shadow-sm' : 'border-slate-200 bg-white/60 hover:border-slate-300')}>
            <span className={cx('block text-[11px] font-semibold', i === step ? 'text-brand' : 'text-slate-400')}>Step {i + 1}</span>
            <span className={cx('block truncate text-[13px] font-semibold', i === step ? 'text-slate-950' : 'text-slate-600')}>{x.name}</span>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand" style={{ transform: `scaleX(${i === step ? progress : i < step ? 1 : 0})`, opacity: i <= step ? 1 : 0 }} />
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-[2.8rem] px-1 text-[14.5px] leading-snug text-slate-700">{TOUR[step].text}</p>
    </div>
  );
}

// the page uses nearly the whole width of the screen (it stops growing on very large monitors)
const Container = ({ className, children }) => <div className={cx('mx-auto w-full max-w-[1720px] px-5 sm:px-8 lg:px-14', className)}>{children}</div>;
const Eyebrow = ({ children, className }) => <p className={cx('inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand-ink', className)}>{children}</p>;
const Title = ({ children, className }) => <h2 className={cx('text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-slate-950 sm:text-[2.6rem]', className)}>{children}</h2>;
const Lede = ({ children, className }) => <p className={cx('text-[17px] leading-relaxed text-pretty text-slate-600', className)}>{children}</p>;

const PRIMARY = 'inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[15px] font-semibold text-brand-fg shadow-[0_10px_24px_-10px_var(--brand)] transition hover:-translate-y-0.5 hover:bg-brand-600';
const SECONDARY = 'inline-flex h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-[15px] font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:border-slate-400';

/* ───────────── header ───────────── */

function Header({ scrolled }) {
  const [open, setOpen] = useState(false);
  return (
    <header className={cx('fixed inset-x-0 top-0 z-40 transition-all duration-300', scrolled || open ? 'border-b border-slate-200 bg-white/85 backdrop-blur-md' : 'border-b border-transparent')}>
      <div aria-hidden className="lp-progress absolute inset-x-0 top-0 h-0.5 bg-brand" />
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${PRODUCT_NAME} home`} className="flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-slate-950"><BrandMark size={28} /> {PRODUCT_NAME}</Link>
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {NAV.map(([label, href]) => <a key={href} href={href} className="text-[14px] font-medium text-slate-600 transition hover:text-slate-950">{label}</a>)}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="inline-flex h-10 items-center rounded-full bg-slate-950 px-5 text-[14px] font-semibold text-white transition hover:bg-slate-800">Sign in</Link>
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center rounded-full text-slate-800 hover:bg-slate-100 lg:hidden">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </Container>
      {open && (
        <nav aria-label="Mobile" className="animate-fade border-t border-slate-200 bg-white px-5 py-2 lg:hidden">
          {NAV.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} className="block border-b border-slate-100 py-3.5 text-[15px] font-medium text-slate-800 last:border-0">{label}</a>)}
        </nav>
      )}
    </header>
  );
}

/* ───────────── hero ───────────── */

const HERO_POINTS = ['Leads to maintenance in one place', 'Your brand on every document', 'A portal for your clients'];

function Hero() {
  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32 lg:pt-36">
      <div aria-hidden className="lp-glow pointer-events-none absolute inset-x-0 -top-40 h-[720px] bg-[radial-gradient(60%_60%_at_70%_30%,color-mix(in_oklab,var(--brand)_16%,white),transparent_70%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,.04)_1px,transparent_1px)] [mask-image:radial-gradient(80%_60%_at_60%_20%,black,transparent)] bg-[size:44px_44px]" />
      {/* words on the left, the tutorial on the right: the two share the width of the screen */}
      <Container className="relative grid items-center gap-12 lg:grid-cols-12 lg:gap-10 xl:gap-16">
        <div className="lg:col-span-6 xl:col-span-6">
          <Reveal><Eyebrow><Sun className="h-3.5 w-3.5" /> Software for solar installation companies</Eyebrow></Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 max-w-[16ch] text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.035em] text-balance text-slate-950 sm:text-[3.6rem] xl:text-[4.4rem]">
              Run your whole solar business from <span className="text-brand">one workspace</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <Lede className="mt-6 max-w-[52ch]">{PRODUCT_NAME} takes a project from the first enquiry to the last service visit: leads, 3D design, proposals, loans, subsidies, billing, stock, installation and maintenance.</Lede>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className={PRIMARY}>Open your workspace <ArrowRight className="h-4 w-4" /></Link>
            <a href="#features" className={SECONDARY}>See all features</a>
          </Reveal>
          <Reveal delay={300}>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-slate-500">
              {HERO_POINTS.map((p) => <li key={p} className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand" /> {p}</li>)}
            </ul>
          </Reveal>
        </div>
        <Reveal delay={200} className="lg:col-span-6 xl:col-span-6">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-2 pb-3 shadow-[0_30px_80px_-30px_rgba(15,23,42,.35)] backdrop-blur">
            <Tutorial />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ───────────── what is inside, scrolling by ───────────── */

const STRIP = [['Leads', 'leads'], ['Lead board', 'lead-board'], ['Clients', 'clients'], ['3D designer', 'roof'], ['Proposals', 'proposals'], ['Estimation', 'quick'], ['Packages', 'packages'], ['Loans', 'loans'], ['Subsidies', 'subsidies'], ['Bills', 'bills'], ['Delivery challans', 'challans'], ['Receipts', 'receipts'], ['Expenses', 'expenses'], ['Inventory', 'inventory'], ['Installations', 'installations'], ['Tasks', 'tasks'], ['AMC tracker', 'amc'], ['Client support', 'support'], ['Client portal', 'portal'], ['Team roles', 'team'], ['Branches', 'branches']];

function Strip() {
  const row = (hidden) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-3 pr-3">
      {STRIP.map(([t, art]) => (
        <li key={t} className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pr-5 pl-1.5 text-[14.5px] font-medium whitespace-nowrap text-slate-700">
          <FeatureArt name={art} className="h-9 w-9 rounded-full" /> {t}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Everything inside" className="lp-marquee-wrap mt-16 overflow-hidden border-y border-slate-200 bg-slate-50 py-5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] sm:mt-24">
      <div className="lp-marquee flex w-max">{row(false)}{row(true)}</div>
    </section>
  );
}

/* ───────────── every feature ───────────── */

const FEATURES = [
  ['Win the customer', 'From the first enquiry to a priced offer.', [
    ['leads', 'Leads', 'Leads from Meta Lead Ads and Google Sheets arrive on their own; walk-ins go on your own form. Status, priority and who it is assigned to.'],
    ['lead-board', 'Lead board', 'Drag leads between stages on a board. Every status date, reschedule and reassignment is kept in the lead’s log.'],
    ['clients', 'Clients', 'Contact details, consumer number, sanctioned load and documents such as bills, ID proofs and roof photos in one record.'],
    ['quick', 'Quick proposals & estimation', 'A priced proposal from your packages and catalog in a minute, when a full 3D design is not needed.'],
    ['packages', 'Packages & catalog', 'Ready system packages and a product catalog with categories, so every quote uses your own items and prices.'],
  ]],
  ['Design the system', 'A 3D design anyone on your team can make.', [
    ['roof', 'Roof from the map', 'Mark the roof on the satellite map, then pick the house that looks like it: flat, one slope, two slopes, four slopes or Kerala style. Ground mounting too.'],
    ['panel-layout', 'Panel layout', 'Place mounting bases and plant panels on them, or fill the roof in one tap. Tanks, staircase rooms and trees are kept clear, with cleaning walkways.'],
    ['structure', 'Mounting structure', 'Pole heights, tilt and supports for each base. The frame is measured and priced by its total length.'],
    ['sun-shading', 'Sun & shading', 'Shadows from walls, obstacles and neighbouring rows are worked out hour by hour, with a shadow report and yearly energy.'],
    ['strings', 'Strings & single-line diagram', 'Strings are worked out for the inverter, or picked panel by panel. The single-line diagram is drawn and checked for you.'],
    ['buildings', 'Several buildings', 'A site with more than one building gets one design and one price, with a breakdown for each building.'],
  ]],
  ['Close the deal', 'Documents and money, in your brand.', [
    ['proposals', 'Branded proposals', 'A proposal PDF with the 3D model, bill of materials, drawings and savings outlook. Share by link, QR code or WhatsApp; clients accept online.'],
    ['loans', 'Loans', 'Set your own loan steps once. A proposal bought on a loan follows them, with remarks the client can read.'],
    ['subsidies', 'Subsidies', 'A subsidy file for each proposal with its own steps; the subsidy is shown under the price and on the PDF.'],
    ['bills', 'Bills', 'Bills for materials taken from stock and for services, with tax on each line and an optional discount.'],
    ['challans', 'Delivery challans', 'Ask for a delivery challan while making a bill: add the delivery details and it is printed with the bill, without prices.'],
    ['receipts', 'Receipts & dues', 'Record advances and part payments as receipts, and see at a glance which clients still owe money.'],
    ['currency-tax', 'Your currency & tax', 'Each company sets its own currency, tax name and usual rate; every screen and document follows it.'],
  ]],
  ['Deliver the project', 'Stock, site work and care after the sale.', [
    ['inventory', 'Inventory', 'Batches with base, wholesale and retail prices, serial numbers, warranties and suppliers. Stock is deducted when a bill is made.'],
    ['installations', 'Installations', 'Installation steps from your own template, assigned by job title and priority, with photos and notes from site.'],
    ['tasks', 'Task management', 'Give work to your staff and follow it until it is done.'],
    ['amc', 'AMC tracker', 'Free maintenance visits are scheduled from the installation date; paid visits are booked by the client and assigned to technicians.'],
    ['support', 'Client support', 'Clients raise requests with photos and PDFs; your team replies and tracks every thread.'],
    ['portal', 'Client portal', 'Clients sign in to read and answer proposals, follow their loan and subsidy, book visits and ask for help.'],
  ]],
  ['Run the company', 'Control for the owner, the right view for everyone else.', [
    ['dashboard', 'Dashboard', 'Charts of leads, proposals, sales and dues, so you see how the business is doing as soon as you sign in.'],
    ['expenses', 'Expenses', 'Record what the company spends, next to what it earns.'],
    ['team', 'Team & roles', 'Roles such as telecaller, accountant or supervisor, or your own. Staff see only what their role allows.'],
    ['branches', 'Branches', 'Work as one office or many. Products are shared across the company; stock, suppliers and packages belong to each branch.'],
    ['notifications', 'Notifications', 'Your team is told when something needs them: a new lead, an assigned step, a client request.'],
    ['private', 'Private by company', 'Every client, product, design and document belongs to one company and is only loaded for that company’s sign-in.'],
  ]],
];

function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <Reveal className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow>All features</Eyebrow>
            <Title className="mt-5 max-w-[22ch]">Everything a solar company does, already connected.</Title>
          </div>
          <Lede className="lg:col-span-5">No separate tools for leads, drawings, quotes and bills. What you enter once is used everywhere after it.</Lede>
        </Reveal>
        <div className="mt-16 space-y-16 sm:mt-20 sm:space-y-20">
          {FEATURES.map(([group, sub, items], g) => (
            <div key={group} className="grid gap-8 lg:grid-cols-12">
              <Reveal className="lg:col-span-3">
                <div className="lg:sticky lg:top-28">
                  <div className="text-[13px] font-semibold tracking-wide text-brand uppercase">Step {g + 1}</div>
                  <h3 className="mt-2 text-[1.5rem] leading-tight font-semibold tracking-tight text-slate-950">{group}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{sub}</p>
                </div>
              </Reveal>
              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-9 xl:grid-cols-3 2xl:grid-cols-4">
                {items.map(([art, name, text], i) => (
                  <Reveal key={name} delay={(i % 4) * 60}>
                    <article className="lp-card h-full rounded-2xl border border-slate-200 bg-white p-5">
                      <FeatureArt name={art} className="lp-art h-16 w-16" />
                      <h4 className="mt-4 text-[16px] font-semibold text-slate-950">{name}</h4>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-600">{text}</p>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ───────────── three things shown large ───────────── */

function Points({ items }) {
  return (
    <ul className="mt-7 space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed text-slate-700">
          <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-brand-fg"><svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Spotlight({ id, tone, eyebrow, title, lede, points, flip, cta, children }) {
  return (
    <section id={id} className={cx('scroll-mt-20 py-20 sm:py-28', tone)}>
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal className={cx(flip && 'lg:order-2')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Title className="mt-5">{title}</Title>
          <Lede className="mt-4">{lede}</Lede>
          <Points items={points} />
          {cta}
        </Reveal>
        <Reveal delay={120} className={cx(flip && 'lg:order-1')}>{children}</Reveal>
      </Container>
    </section>
  );
}

function Spotlights() {
  return (
    <>
      <Spotlight
        id="design"
        tone="bg-slate-50 border-y border-slate-200"
        eyebrow="3D design"
        title="A real-looking design in a few taps."
        lede="Your sales staff can make it in front of the customer. No drawing skills needed."
        points={['Find the address and mark the roof on the satellite picture', 'Pick the type of house and its floors, or choose ground mounted', 'Size the system by the monthly bill or by kW', 'Panels, structure, strings and price are worked out together']}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_30px_70px_-30px_rgba(15,23,42,.3)]">
          <Frame title={`${PRODUCT_NAME} · Designer · Panels`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot from public/landing */}
            <img src="/landing/designer-panels.jpg" alt="The designer's Panels step: a three-floor building with its roof filled with 104 panels" width={1456} height={826} loading="lazy" className="block w-full" />
          </Frame>
        </div>
      </Spotlight>
      <Spotlight
        id="proposals"
        flip
        eyebrow="Proposals"
        title="A proposal your client is glad to open."
        lede="Your logo, your colours and your terms on every page, made from the design with one press."
        points={['The 3D model, bill of materials, drawings and savings outlook', 'Share a link, a QR code or send it on WhatsApp', 'Clients accept or ask for changes online', 'Subsidy and loan shown next to the price']}
        cta={(
          <div className="mt-9">
            <Link href="/free-proposal" className={PRIMARY}>Create your free proposal <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-3 text-[14px] text-slate-500">No sign-in needed. Enter your details, the items and the price, pick a design and download the PDF.</p>
          </div>
        )}
      >
        <div className="lp-float mx-auto max-w-[420px]"><ProposalMock style={proposalVars(BRAND, ACCENT)} /></div>
      </Spotlight>
      <Spotlight
        id="portal"
        tone="bg-slate-50 border-y border-slate-200"
        eyebrow="Client portal"
        title="Your clients always know where things stand."
        lede="Fewer “any update?” calls. Each client gets a sign-in of their own."
        points={['Read and answer proposals', 'Follow the loan and the subsidy step by step', 'Book maintenance visits', 'Ask for help with photos and documents']}
      >
        <div className="lp-float"><PortalPhone /></div>
      </Spotlight>
    </>
  );
}

/* ───────────── how it works ───────────── */

const STEPS = [
  ['A lead comes in', 'From your ads, a sheet or your own form. It is assigned to someone on your team and followed on the board.'],
  ['Design and propose', 'Mark the roof, pick the house, place the panels. The priced proposal goes to the client by link or WhatsApp.'],
  ['Book and bill', 'The client accepts. Loan and subsidy follow their steps; bills, challans and receipts come from your stock and prices.'],
  ['Install and look after', 'Your team works through the installation steps, and maintenance visits are scheduled for the years after.'],
];

function How({ stepsRef }) {
  return (
    <section id="how" className="scroll-mt-20 py-24 sm:py-32">
      <Container>
        <Reveal>
          <Eyebrow>How it works</Eyebrow>
          <Title className="mt-5">One project, one continuous line.</Title>
        </Reveal>
        <ol ref={stepsRef} className="relative mt-14 grid gap-10 md:grid-cols-2 xl:grid-cols-4 xl:gap-8">
          {/* the line the steps sit on: it fills as the section scrolls by (across on wide screens) */}
          <span aria-hidden className="absolute top-5 right-0 left-0 hidden h-px bg-slate-200 xl:block" />
          <span aria-hidden className="lp-line absolute top-5 right-0 left-0 hidden h-px bg-brand xl:block" />
          {STEPS.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 90} className="relative">
              <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-[15px] font-semibold text-brand shadow-sm">{i + 1}</span>
              <h3 className="mt-5 text-[19px] font-semibold text-slate-950">{t}</h3>
              <p className="mt-2 max-w-[38ch] text-[15.5px] leading-relaxed text-slate-600">{d}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ───────────── FAQ ───────────── */

const FAQ = [
  ['How do I get a workspace?', 'Company workspaces are created by the platform administrator, who gives you a sign-in email and a temporary password. You can change the password after your first sign-in.'],
  ['Can my leads come in automatically?', 'Yes. Connect Meta Lead Ads or a Google Sheet once and new leads arrive in your workspace on their own. You can still add walk-ins by hand with your own lead form.'],
  ['Do I need to know CAD to make a design?', 'No. You mark the roof on the satellite map, pick the house that looks like the building and say how many floors it has. Panels, structure and strings are worked out from there, and you can adjust any of them.'],
  ['Do my clients get an account?', 'Every client with an email address can get a portal sign-in. There they read their proposals, respond to them, follow their loan and subsidy, book maintenance visits and ask for help. Clients without one simply receive the PDF.'],
  ['How accurate are the energy figures?', 'Sunlight is modelled for the building’s location, and shading from walls, tanks, trees and neighbouring panel rows is worked out hour by hour. Figures are indicative and should be confirmed with a site visit; the proposal says so too.'],
  ['Can my staff only see their own work?', 'Yes. Staff always see the leads, installation steps and maintenance visits assigned to them. Anything more, such as finances, inventory or loans, is granted through roles you define.'],
  ['Can other companies see my data?', 'No. Every client, product, design and image belongs to one company and is only ever loaded for that company’s sign-in.'],
];

/** One question: the answer slides open and closed (its row grows from nothing to its own height). */
function FaqItem({ q, a, open, onToggle, id }) {
  return (
    <div>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-[16px] font-semibold text-slate-950 transition-colors hover:text-brand">
          {q}
          <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all duration-300', open ? 'rotate-180 border-brand bg-brand text-brand-fg' : 'border-slate-200 text-slate-500')}><ChevronDown className="h-4 w-4" /></span>
        </button>
      </h3>
      <div id={id} role="region" inert={!open} className={cx('lp-faq grid', open && 'is-open')}>
        <div className="overflow-hidden">
          <p className="max-w-[70ch] pb-6 text-[15px] leading-relaxed text-slate-600">{a}</p>
        </div>
      </div>
    </div>
  );
}

const FAQ_FACTS = ['Set up for you by the platform administrator', 'Your own logo, colours, currency and tax', 'A separate sign-in for staff and for clients'];

function Faq() {
  const [open, setOpen] = useState(0); // one answer open at a time; the first one to start with
  return (
    <section id="faq" className="scroll-mt-20 border-t border-slate-200 bg-slate-50 py-24 sm:py-32">
      <Container className="grid gap-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Eyebrow>FAQ</Eyebrow>
            <Title className="mt-5">Good to know.</Title>
            <Lede className="mt-4 max-w-[40ch]">The questions solar companies ask most before they start: getting a workspace, what the team and the clients can see, and how far to trust the numbers.</Lede>
            <ul className="mt-6 space-y-2.5">
              {FAQ_FACTS.map((t) => <li key={t} className="flex items-start gap-2.5 text-[15px] text-slate-700"><ShieldCheck className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" /> {t}</li>)}
            </ul>
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-[16px] font-semibold text-slate-950">Something else on your mind?</div>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-600">Your platform administrator can answer it, and can set up a workspace for your company.</p>
              <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-[14.5px] font-semibold text-brand hover:underline">Already have a workspace? Sign in <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </Reveal>
        <Reveal delay={100} className="divide-y divide-slate-200 self-start rounded-2xl border border-slate-200 bg-white px-6 lg:col-span-8">
          {FAQ.map(([q, a], i) => <FaqItem key={q} id={`faq-${i}`} q={q} a={a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
        </Reveal>
      </Container>
    </section>
  );
}

/* ───────────── CTA + footer ───────────── */

function Cta() {
  return (
    <section className="py-20 sm:py-28">
      <Container>
        <Reveal className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[720px] -translate-x-1/2 rounded-full bg-brand opacity-40 blur-3xl" />
          <h2 className="relative mx-auto max-w-[20ch] text-[2rem] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-white sm:text-[2.75rem]">Ready before the next client calls.</h2>
          <p className="relative mx-auto mt-4 max-w-[48ch] text-[17px] leading-relaxed text-slate-300">Sign in to your company workspace, or ask your platform administrator to set one up.</p>
          <div className="relative mt-8 flex justify-center">
            <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-slate-100">Sign in <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

function Footer() {
  const cols = [
    ['Product', [['All features', '#features'], ['3D design', '#design'], ['Proposals', '#proposals'], ['Client portal', '#portal'], ['How it works', '#how'], ['FAQ', '#faq']]],
    ['Workspace', [['Sign in', '/login'], ['Company dashboard', '/dashboard'], ['Staff workspace', '/agent'], ['Client portal', '/portal']]],
  ];
  return (
    <footer className="border-t border-slate-200">
      <Container className="grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-6">
          <span className="flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-slate-950"><BrandMark size={28} /> {PRODUCT_NAME}</span>
          <p className="mt-4 max-w-[40ch] text-[14.5px] leading-relaxed text-slate-500">The workspace for solar installation companies: leads, design, proposals, loans, subsidies, billing, stock, installations and maintenance.</p>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title} className="md:col-span-3">
            <div className="text-[13px] font-semibold tracking-wide text-slate-950 uppercase">{title}</div>
            <ul className="mt-4 space-y-2.5 text-[14.5px]">{links.map(([label, href]) => <li key={label}>{href.startsWith('#') ? <a href={href} className="text-slate-600 hover:text-slate-950">{label}</a> : <Link href={href} className="text-slate-600 hover:text-slate-950">{label}</Link>}</li>)}</ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-slate-200"><Container className="flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-slate-500"><span>© {new Date().getFullYear()} {PRODUCT_NAME}</span><span>Made for solar installers</span></Container></div>
    </footer>
  );
}

/* ───────────── the page ───────────── */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  // the page scrolls inside this container (the app shell keeps <body> fixed)
  const rootRef = useRef(null);
  const contentRef = useRef(null);
  const stepsRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return undefined;

    // everything the scroll position moves is a CSS variable, so no React render happens while scrolling
    const apply = () => {
      const y = root.scrollTop;
      const limit = Math.max(1, root.scrollHeight - root.clientHeight);
      root.style.setProperty('--lp-progress', clamp01(y / limit).toFixed(4));
      root.style.setProperty('--lp-y', y.toFixed(0));
      const steps = stepsRef.current;
      if (steps) {
        const r = steps.getBoundingClientRect();
        steps.style.setProperty('--lp-steps', clamp01((root.clientHeight * 0.85 - r.top) / (root.clientHeight * 0.5)).toFixed(4));
      }
      setScrolled(y > 24);
    };
    apply();

    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (calm) {
      root.addEventListener('scroll', apply, { passive: true });
      return () => root.removeEventListener('scroll', apply);
    }

    const lenis = new Lenis({ wrapper: root, content, lerp: 0.09, wheelMultiplier: 1, smoothWheel: true, autoRaf: true });
    lenis.on('scroll', apply);
    // links to a section glide there, stopping under the fixed header
    const onClick = (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      const target = a && content.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -72, duration: 1.2 });
    };
    root.addEventListener('click', onClick);
    return () => {
      root.removeEventListener('click', onClick);
      lenis.destroy();
    };
  }, []);

  return (
    <div ref={rootRef} style={PAGE_THEME} className="lp h-dvh overflow-x-hidden overflow-y-auto bg-white text-slate-900 antialiased">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div ref={contentRef}>
        <Header scrolled={scrolled} />
        <main>
          <Hero />
          <Strip />
          <Features />
          <Spotlights />
          <How stepsRef={stepsRef} />
          <Faq />
          <Cta />
        </main>
        <Footer />
      </div>
    </div>
  );
}

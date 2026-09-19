// Illustrations for the landing page, drawn in SVG / CSS so they follow the brand colours and stay
// sharp at any size. They picture the real product: the 3D designer and the proposal PDF.
import { Check, Download, MapPin, Sun } from 'lucide-react';
import { cx } from '../kit';
import { PRODUCT_NAME } from '../layout/Brand';

// isometric ground plane: x → right-down, y → left-down
const ISO = 'matrix(0.866 0.5 -0.866 0.5 0 0)';

/** A flat-roofed building with tilted panel rows, seen from above at an angle. */
export function RoofIllustration({ className, rows = 3, cols = 8 }) {
  const w = 300; // roof, in plane units
  const d = 200;
  const h = 92; // wall height on screen
  const pw = 27;
  const pd = 40;
  const panels = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) panels.push([26 + c * (pw + 4), 22 + r * (pd + 16)]);
  // screen positions of the roof corners (for the walls)
  const pt = (x, y) => [0.866 * x - 0.866 * y, 0.5 * x + 0.5 * y];
  const [ax, ay] = pt(0, d);
  const [bx, by] = pt(w, d);
  const [cx2, cy2] = pt(w, 0);
  return (
    <svg viewBox="-200 -30 480 400" className={className} role="img" aria-label="3D model of a roof with solar panels">
      <defs>
        <linearGradient id="roof-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e293b" /><stop offset="1" stopColor="#0b1220" /></linearGradient>
        <linearGradient id="roof-wall-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#64748b" /><stop offset="1" stopColor="#475569" /></linearGradient>
        <linearGradient id="roof-wall-r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#475569" /><stop offset="1" stopColor="#334155" /></linearGradient>
        <radialGradient id="roof-shadow"><stop offset="0" stopColor="#0f172a" stopOpacity="0.28" /><stop offset="1" stopColor="#0f172a" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="45" cy={by + h - 10} rx="250" ry="70" fill="url(#roof-shadow)" />
      {/* walls */}
      <polygon points={`${ax},${ay} ${bx},${by} ${bx},${by + h} ${ax},${ay + h}`} fill="url(#roof-wall-l)" />
      <polygon points={`${bx},${by} ${cx2},${cy2} ${cx2},${cy2 + h} ${bx},${by + h}`} fill="url(#roof-wall-r)" />
      {/* roof slab + parapet */}
      <g transform={ISO}>
        <rect x="0" y="0" width={w} height={d} fill="#94a3b8" />
        <rect x="9" y="9" width={w - 18} height={d - 18} fill="#cbd5e1" />
        <rect x="232" y="18" width="46" height="40" fill="#94a3b8" />
      </g>
      {/* staircase room */}
      <g transform="translate(0 -30)"><g transform={ISO}><rect x="232" y="18" width="46" height="40" fill="#e2e8f0" /></g></g>
      {/* panels: drawn slightly raised, with a soft shadow on the slab */}
      <g transform={ISO} opacity="0.22">{panels.map(([x, y]) => <rect key={`s${x}-${y}`} x={x + 5} y={y + 7} width={pw} height={pd} fill="#0f172a" />)}</g>
      <g transform="translate(0 -9)">
        <g transform={ISO}>
          {panels.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width={pw} height={pd} rx="1.5" fill="url(#roof-panel)" stroke="#e2e8f0" strokeWidth="0.8" />
              <path d={`M${x + pw / 2} ${y}v${pd}M${x} ${y + pd / 3}h${pw}M${x} ${y + (pd * 2) / 3}h${pw}`} stroke="#334155" strokeWidth="0.6" />
            </g>
          ))}
        </g>
      </g>
      {/* sunlight sweeping across */}
      <g className="animate-sun" style={{ transformOrigin: 'center' }}>
        <g transform="translate(0 -9)"><g transform={ISO}><rect x="40" y="10" width="70" height={d - 20} fill="white" opacity="0.13" transform="skewX(-18)" /></g></g>
      </g>
    </svg>
  );
}

function Window({ title, children, className }) {
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5', className)}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 truncate rounded-md bg-white px-3 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** The designer's last step: 3D roof on the left, sizing + result on the right. */
export function DesignerMock({ className }) {
  return (
    <Window title={`${PRODUCT_NAME} · Designer · Solar plan`} className={className}>
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 text-[11px]">
        <span className="font-semibold text-slate-900">Kumar residence</span>
        <span className="hidden text-slate-400 sm:inline">For Ravi Kumar · Camp, Pune</span>
        <span className="ml-auto hidden items-center gap-1 text-slate-400 sm:flex"><Check className="h-3 w-3" /> All changes saved</span>
        <span className="flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1.5 font-semibold text-brand-fg"><Download className="h-3 w-3" /> Download proposal</span>
      </div>
      <div className="grid md:grid-cols-[1fr_230px]">
        <div className="relative min-h-[230px] overflow-hidden bg-gradient-to-br from-sky-100 via-slate-100 to-emerald-50">
          <div className="absolute inset-0 bg-grid opacity-60" />
          <RoofIllustration className="relative mx-auto h-full max-h-[330px] w-full" />
          <div className="absolute top-3 left-3 flex rounded-full bg-white p-0.5 text-[10px] font-medium shadow"><span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">3D</span><span className="px-2.5 py-1 text-slate-500">Plan view</span></div>
          <div className="absolute right-3 bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[10px] text-slate-600 backdrop-blur"><Sun className="h-3 w-3 text-accent" /> 12:00 PM<span className="relative mx-1 h-1 flex-1 rounded-full bg-slate-200"><span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-brand" /></span>Shadows</div>
        </div>
        <div className="space-y-3 border-t border-slate-200 p-4 text-left md:border-t-0 md:border-l">
          <div>
            <div className="text-[11px] font-semibold text-slate-900">Size the system by</div>
            <div className="mt-1.5 grid grid-cols-2 gap-0.5 rounded-md bg-slate-100 p-0.5 text-center text-[10px] font-medium"><span className="rounded bg-white py-1 text-slate-900 shadow-sm">Monthly bill</span><span className="py-1 text-slate-500">Kilowatt (kW)</span></div>
            <div className="mt-1.5 flex items-center justify-between rounded-md border-2 border-brand px-2.5 py-1.5 text-sm font-semibold text-slate-900">6,500<span className="text-[10px] font-medium text-slate-400">INR</span></div>
          </div>
          <div className="rounded-lg bg-slate-900 p-3 text-white">
            <div className="text-lg leading-none font-bold">24 panels <span className="text-[11px] font-medium text-slate-400">· 9.6 kW</span></div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
              <div>Generates<div className="text-[13px] font-semibold text-white">1,150 units</div></div>
              <div>Payback<div className="text-[13px] font-semibold text-white">3.4 years</div></div>
            </div>
          </div>
          {[['1. Panel brand', 'Waaree'], ['2. Model', 'Ahnay WSMD-540 · 540 W']].map(([l, v]) => (
            <div key={l}><div className="text-[10px] font-medium text-slate-500">{l}</div><div className="mt-0.5 truncate rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-800">{v}</div></div>
          ))}
        </div>
      </div>
    </Window>
  );
}

/** First page of the proposal PDF. Colours come from CSS variables so the branding section can re-theme it. */
export function ProposalMock({ company = 'Sunrise Solar', className, style }) {
  return (
    <div className={cx('relative aspect-[210/297] w-full overflow-hidden rounded-xl bg-white text-left shadow-[0_30px_70px_-20px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/10', className)} style={style}>
      <div className="flex items-center justify-between px-[6%] pt-[4.5%]">
        <div className="flex items-center gap-[3%]" style={{ width: '55%' }}>
          <span className="grid aspect-square w-[16%] place-items-center rounded-[22%]" style={{ background: 'var(--p)' }}><Sun className="h-[60%] w-[60%] text-white" /></span>
          <span className="truncate text-[clamp(8px,1.5vw,13px)] font-bold" style={{ color: 'var(--ink)' }}>{company}</span>
        </div>
        <div className="text-right text-[clamp(5px,0.8vw,8px)] leading-tight text-slate-400"><b className="block tracking-[0.18em] text-slate-700">SOLAR PROPOSAL</b>Ref. SP-20260919</div>
      </div>
      {/* hero */}
      <div className="relative mt-[4%] h-[42%] overflow-hidden" style={{ background: 'linear-gradient(135deg,#fff, var(--cream))' }}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M51 0C42 14 41 25 35 36S27 53 21 60H100V0Z" fill="var(--a)" opacity="0.18" />
          <path d="M55 0C46 14 45 25 39 36S31 53 25 60H100V0Z" fill="#475569" />
        </svg>
        <RoofIllustration rows={2} cols={6} className="absolute top-[4%] right-[-6%] h-[100%] w-[72%]" />
        <div className="absolute top-[12%] left-[6%] w-[44%]">
          <div className="text-[clamp(4px,0.6vw,7px)] tracking-[0.2em] text-slate-500">ROOFTOP SOLAR POWER SYSTEM</div>
          <div className="mt-[6%] text-[clamp(11px,2.3vw,24px)] leading-[1.05] font-bold" style={{ color: 'var(--ink)' }}>Kumar residence</div>
          <div className="text-[clamp(10px,2vw,20px)] font-bold" style={{ color: 'var(--p)' }}>9.6 kWp</div>
          <div className="mt-[5%] h-[3px] w-[22%] rounded-full" style={{ background: 'var(--a)' }} />
          <div className="mt-[6%] flex items-center gap-1 text-[clamp(5px,0.75vw,8px)] text-slate-500"><MapPin className="h-[1.2em] w-[1.2em]" /> Camp, Pune</div>
        </div>
      </div>
      {/* stats */}
      <div className="mx-[4%] mt-[3%] grid grid-cols-4 gap-[2%] rounded-[6px] p-[3%]" style={{ background: 'var(--panel)' }}>
        {[['SYSTEM', '9.6 kWp'], ['ENERGY', '13,800 kWh'], ['SAVINGS', '₹1,31,000'], ['PAYBACK', '3.4 yrs']].map(([l, v], i) => (
          <div key={l}>
            <span className="block aspect-square w-[30%] rounded-full" style={{ background: i === 1 ? 'var(--a)' : 'var(--p)' }} />
            <div className="mt-[10%] text-[clamp(3.5px,0.5vw,6px)] tracking-wide" style={{ color: 'var(--p)' }}>{l}</div>
            <div className="text-[clamp(6px,1vw,11px)] font-bold whitespace-nowrap" style={{ color: 'var(--ink)' }}>{v}</div>
          </div>
        ))}
      </div>
      {/* cards */}
      <div className="mx-[4%] mt-[3%] grid grid-cols-2 gap-[3%]">
        {['PREPARED FOR', 'PREPARED BY'].map((l) => (
          <div key={l} className="rounded-[6px] border border-slate-200 p-[6%]">
            <div className="flex items-center gap-[6%]"><span className="aspect-square w-[14%] rounded-full" style={{ background: 'var(--p)' }} /><span className="text-[clamp(3.5px,0.5vw,6px)]" style={{ color: 'var(--p)' }}>{l}</span></div>
            <div className="mt-[8%] space-y-[5%]"><div className="h-[3px] w-[70%] rounded bg-slate-300" /><div className="h-[2px] w-[90%] rounded bg-slate-200" /><div className="h-[2px] w-[60%] rounded bg-slate-200" /></div>
          </div>
        ))}
      </div>
      {/* wave footer */}
      <svg viewBox="0 0 100 16" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[11%] w-full">
        <path d="M0 5C22 1 40 8 62 8S90 3 100 1V16H0Z" fill="var(--p)" opacity="0.45" />
        <path d="M0 8C22 4 40 11 62 11S90 6 100 4V16H0Z" fill="var(--deep)" />
      </svg>
    </div>
  );
}

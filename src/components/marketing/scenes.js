// Technical drawings for the landing page: thin-stroke SVG in the page's ink colour, the way an engineering sheet
// would show them. They describe real things the product calculates (sun path, panel layout) rather than decorate.
import { Check } from 'lucide-react';
import { cx } from '../kit';

const INK = 'currentColor';
const MONO = 'var(--font-geist-mono), monospace';

/** One module, drawn as a datasheet would: front elevation with the cell grid, and a side elevation on its mount. */
export function ModuleDrawing({ className }) {
  const fx = 46;
  const fy = 44;
  const fw = 198;
  const fh = 342;
  const cols = 6;
  const rows = 12;
  const gap = 3;
  const cw = (fw - 10 - gap * (cols - 1)) / cols;
  const ch = (fh - 10 - gap * (rows - 1)) / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([fx + 5 + c * (cw + gap), fy + 5 + r * (ch + gap)]);
  // side elevation: a module tilted 15° on a rail and two legs
  const tilt = (15 * Math.PI) / 180;
  const L = 200;
  const bx = 318;
  const by = 300;
  const tx = bx + L * Math.cos(tilt);
  const ty = by - L * Math.sin(tilt);
  const nx = Math.sin(tilt) * 8;
  const ny = Math.cos(tilt) * 8;
  return (
    <svg viewBox="0 0 560 420" className={cx('text-stone-900', className)} role="img" aria-label="Datasheet drawing of a 540 W solar module: front elevation with cells and dimensions, and side elevation at 15° tilt">
      <text x={fx} y="26" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">FRONT · 540 W · 144 HALF-CUT CELLS</text>
      {/* front elevation */}
      <rect x={fx} y={fy} width={fw} height={fh} fill="none" stroke={INK} strokeWidth="1.2" />
      <rect x={fx + 3} y={fy + 3} width={fw - 6} height={fh - 6} fill="none" stroke={INK} strokeWidth="0.5" opacity="0.5" />
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={cw} height={ch} fill="#0F6E56" fillOpacity="0.9" />)}
      {Array.from({ length: cols }, (_, c) => <line key={c} x1={fx + 5 + c * (cw + gap) + cw / 2} y1={fy + 5} x2={fx + 5 + c * (cw + gap) + cw / 2} y2={fy + fh - 5} stroke="#fff" strokeWidth="0.6" opacity="0.5" />)}
      <line x1={fx} y1={fy + fh / 2} x2={fx + fw} y2={fy + fh / 2} stroke="#fff" strokeWidth="1.2" opacity="0.7" />
      {/* dimensions */}
      <line x1={fx} y1={fy + fh + 18} x2={fx + fw} y2={fy + fh + 18} stroke={INK} strokeWidth="0.8" />
      <line x1={fx} y1={fy + fh + 12} x2={fx} y2={fy + fh + 24} stroke={INK} strokeWidth="0.8" /><line x1={fx + fw} y1={fy + fh + 12} x2={fx + fw} y2={fy + fh + 24} stroke={INK} strokeWidth="0.8" />
      <text x={fx + fw / 2} y={fy + fh + 32} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">1134 mm</text>
      <line x1={fx + fw + 18} y1={fy} x2={fx + fw + 18} y2={fy + fh} stroke={INK} strokeWidth="0.8" />
      <line x1={fx + fw + 12} y1={fy} x2={fx + fw + 24} y2={fy} stroke={INK} strokeWidth="0.8" /><line x1={fx + fw + 12} y1={fy + fh} x2={fx + fw + 24} y2={fy + fh} stroke={INK} strokeWidth="0.8" />
      <text x={fx + fw + 30} y={fy + fh / 2} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7" transform={`rotate(90 ${fx + fw + 30} ${fy + fh / 2})`}>2278 mm</text>
      {/* side elevation */}
      <text x={bx - 8} y="26" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">SIDE · TILT 15° · SOUTH</text>
      <line x1="300" y1={by} x2="548" y2={by} stroke={INK} strokeWidth="1" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={302 + i * 21} y1={by} x2={296 + i * 21} y2={by + 7} stroke={INK} strokeWidth="0.6" opacity="0.5" />)}
      <polygon points={`${bx},${by - 40} ${tx},${ty - 40} ${tx + nx},${ty - 40 + ny} ${bx + nx},${by - 40 + ny}`} fill="#0F6E56" fillOpacity="0.9" stroke={INK} strokeWidth="0.8" />
      {/* rail and legs */}
      {[bx + 30, tx - 30].map((x) => <line key={x} x1={x} y1={by - 40 + ny - (x - bx - nx) * Math.tan(tilt)} x2={x} y2={by} stroke={INK} strokeWidth="1.2" />)}
      <line x1={bx + 30} y1={by - 2} x2={tx - 30} y2={by - 2} stroke={INK} strokeWidth="1.2" />
      {/* angle */}
      <path d={`M ${bx + 60} ${by - 40} A 60 60 0 0 0 ${bx + 60 * Math.cos(tilt)} ${by - 40 - 60 * Math.sin(tilt)}`} fill="none" stroke={INK} strokeWidth="0.6" />
      <line x1={bx} y1={by - 40} x2={bx + 90} y2={by - 40} stroke={INK} strokeWidth="0.5" strokeDasharray="2 3" />
      <text x={bx + 68} y={by - 46} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">15°</text>
      {/* the sun and its ray, normal to the module */}
      <circle cx="486" cy="86" r="9" fill="#F5B82E" />
      <line x1="486" y1="86" x2={(bx + tx) / 2} y2={(by + ty) / 2 - 40} stroke="#F5B82E" strokeWidth="1" strokeDasharray="2 3" />
      <text x="300" y={by + 24} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">ROW PITCH SET FROM WINTER SHADOW</text>
    </svg>
  );
}

/** The sun's path over a roof across one day, with the hour marks the shading model samples. */
export function SunPathDiagram({ className }) {
  const cx0 = 300;
  const cy0 = 250;
  const r = 210;
  const hours = Array.from({ length: 13 }, (_, i) => 6 + i); // 06:00 … 18:00
  const pos = (h) => {
    const a = Math.PI - ((h - 6) / 12) * Math.PI; // sunrise on the left, sunset on the right
    return [cx0 + r * Math.cos(a), cy0 - r * Math.sin(a)];
  };
  const [sx, sy] = pos(13.5);
  return (
    <svg viewBox="0 0 600 300" className={cx('text-stone-900', className)} role="img" aria-label="Diagram of the sun's path over a roof from 06:00 to 18:00">
      <line x1="20" y1={cy0} x2="580" y2={cy0} stroke={INK} strokeWidth="1" />
      {Array.from({ length: 28 }, (_, i) => <line key={i} x1={20 + i * 20.7} y1={cy0} x2={12 + i * 20.7} y2={cy0 + 8} stroke={INK} strokeWidth="0.6" opacity="0.5" />)}
      <path d={`M ${cx0 - r} ${cy0} A ${r} ${r} 0 0 1 ${cx0 + r} ${cy0}`} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="3 4" />
      {hours.map((h) => {
        const [x, y] = pos(h);
        return (
          <g key={h}>
            <circle cx={x} cy={y} r="2" fill={INK} />
            {h % 3 === 0 && <text x={x} y={y - 10} textAnchor="middle" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">{String(h).padStart(2, '0')}:00</text>}
          </g>
        );
      })}
      <circle cx={sx} cy={sy} r="9" fill="#F5B82E" />
      <line x1={sx} y1={sy} x2="300" y2={cy0 - 44} stroke="#F5B82E" strokeWidth="1" strokeDasharray="2 3" />
      {/* a panel row on a flat roof behind a parapet, with its shadow */}
      <rect x="150" y={cy0 - 34} width="300" height="34" fill="none" stroke={INK} strokeWidth="1" />
      <line x1="150" y1={cy0 - 34} x2="150" y2={cy0 - 50} stroke={INK} strokeWidth="1" />
      <path d={`M 240 ${cy0 - 34} L 360 ${cy0 - 60} L 364 ${cy0 - 56} L 244 ${cy0 - 30} Z`} fill="#0F6E56" stroke={INK} strokeWidth="0.8" />
      <path d={`M 244 ${cy0 - 34} L 300 ${cy0 - 34} L 258 ${cy0 - 46} Z`} fill={INK} opacity="0.12" />
      <text x="152" y={cy0 - 54} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">PARAPET 0.6 m</text>
      <text x="368" y={cy0 - 58} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">TILT 15°</text>
      <text x="22" y={cy0 + 24} fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">SHADING SAMPLED HOURLY · 365 DAYS</text>
    </svg>
  );
}

/** Plan view of a panel array on a roof with the obstacles kept clear — the layout the designer produces. */
export function ArrayPlan({ className }) {
  const pw = 36;
  const ph = 60;
  const panels = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      if ((r === 0 && c >= 6) || (r === 2 && c <= 1)) continue; // the water tank and the staircase room
      panels.push([70 + c * (pw + 6), 60 + r * (ph + 22)]);
    }
  }
  return (
    <svg viewBox="0 0 530 320" className={cx('text-stone-900', className)} role="img" aria-label="Plan drawing of a rooftop panel layout around a water tank and staircase room">
      <rect x="40" y="36" width="440" height="252" fill="none" stroke={INK} strokeWidth="1.2" />
      <rect x="48" y="44" width="424" height="236" fill="none" stroke={INK} strokeWidth="0.6" strokeDasharray="2 3" opacity="0.6" />
      {panels.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width={pw} height={ph} fill="#0F6E56" fillOpacity="0.9" stroke={INK} strokeWidth="0.6" />
          <line x1={x + pw / 2} y1={y} x2={x + pw / 2} y2={y + ph} stroke="#fff" strokeWidth="0.5" opacity="0.5" />
        </g>
      ))}
      <circle cx="430" cy="92" r="26" fill="none" stroke={INK} strokeWidth="1" />
      <circle cx="430" cy="92" r="20" fill="none" stroke={INK} strokeWidth="0.6" />
      <text x="430" y="135" textAnchor="middle" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">TANK</text>
      <rect x="62" y="216" width="84" height="56" fill="none" stroke={INK} strokeWidth="1" />
      {Array.from({ length: 6 }, (_, i) => <line key={i} x1={70 + i * 12} y1="216" x2={70 + i * 12} y2="272" stroke={INK} strokeWidth="0.5" opacity="0.6" />)}
      <text x="104" y="250" textAnchor="middle" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">STAIR</text>
      <line x1="40" y1="304" x2="480" y2="304" stroke={INK} strokeWidth="0.8" />
      <line x1="40" y1="298" x2="40" y2="310" stroke={INK} strokeWidth="0.8" /><line x1="480" y1="298" x2="480" y2="310" stroke={INK} strokeWidth="0.8" />
      <text x="260" y="316" textAnchor="middle" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">18.4 m</text>
      <line x1="500" y1="36" x2="500" y2="288" stroke={INK} strokeWidth="0.8" />
      <line x1="494" y1="36" x2="506" y2="36" stroke={INK} strokeWidth="0.8" /><line x1="494" y1="288" x2="506" y2="288" stroke={INK} strokeWidth="0.8" />
      <text x="512" y="166" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7" transform="rotate(90 512 166)">10.5 m</text>
      <text x="40" y="26" fontSize="9" fontFamily={MONO} fill={INK} opacity="0.7">PANEL LAYOUT · 23 × 540 W · 12.4 kWp</text>
    </svg>
  );
}

const LOAN_STEPS = [['Documents collected', 'done'], ['Application submitted', 'done'], ['Loan sanctioned', 'current'], ['Loan disbursed', 'todo']];

/** The client portal on a phone — their loan's progress and a maintenance visit to book. */
export function PortalPhone({ className }) {
  return (
    <div className={cx('mx-auto w-[280px] rounded-[2.2rem] border border-stone-300 bg-white p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]', className)}>
      <div className="overflow-hidden rounded-[1.7rem] border border-stone-200 bg-[#f7f7f4] text-left">
        <div className="border-b border-stone-200 bg-white px-5 pt-9 pb-4">
          <div className="font-mono text-[10px] tracking-wide text-stone-500 uppercase">Client portal</div>
          <div className="mt-1 text-[17px] font-semibold text-stone-950">My loan</div>
          <div className="mt-3 flex items-center gap-1">{LOAN_STEPS.map(([n, s]) => <span key={n} className={cx('h-1 flex-1', s === 'done' ? 'bg-[#0F6E56]' : s === 'current' ? 'bg-[#F5B82E]' : 'bg-stone-200')} />)}</div>
          <div className="mt-2 flex justify-between text-[11px] text-stone-500"><span>2 of 4 steps</span><span>State Bank of India</span></div>
        </div>
        <ol className="divide-y divide-stone-200 bg-white">
          {LOAN_STEPS.map(([name, s]) => (
            <li key={name} className="flex items-center gap-3 px-5 py-3 text-[12.5px]">
              <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border', s === 'done' ? 'border-[#0F6E56] bg-[#0F6E56] text-white' : s === 'current' ? 'border-[#F5B82E] bg-white' : 'border-stone-300 bg-white')}>
                {s === 'done' && <Check className="h-3 w-3" />}
                {s === 'current' && <span className="h-2 w-2 rounded-full bg-[#F5B82E]" />}
              </span>
              <span className={cx(s === 'todo' ? 'text-stone-400' : 'text-stone-800', s === 'current' && 'font-medium')}>{name}</span>
            </li>
          ))}
        </ol>
        <div className="m-4 rounded-xl border border-stone-200 bg-white p-3.5">
          <div className="flex items-center justify-between text-[12px]"><span className="font-medium text-stone-950">Panel cleaning</span><span className="font-mono text-[10px] text-stone-500">₹9,000 / visit</span></div>
          <div className="mt-0.5 text-[11px] text-stone-500">Optional · book whenever needed</div>
          <div className="mt-3 rounded-lg bg-stone-950 py-2 text-center text-[11.5px] font-medium text-white">Book a visit</div>
        </div>
      </div>
    </div>
  );
}

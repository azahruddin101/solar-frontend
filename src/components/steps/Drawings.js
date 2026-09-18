'use client';

// Vector drawings shared by the on-screen report (SVG). The PDF draws the same data with jsPDF.
import { rectPoly } from '@/lib/geometry';

export function planBounds(design) {
  const pts = [...design.sections.flatMap((s) => s.poly), ...design.tables.flatMap((t) => t.poly)];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function fit(bb, x, y, w, h, pad = 0.1) {
  const sx = (bb.maxX - bb.minX) * (1 + 2 * pad) || 1;
  const sy = (bb.maxY - bb.minY) * (1 + 2 * pad) || 1;
  const scale = Math.min(w / sx, h / sy);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  return { scale, map: (p) => ({ x: x + w / 2 + (p.x - cx) * scale, y: y + h / 2 - (p.y - cy) * scale }) };
}

export function LayoutSvg({ design, strings = true }) {
  const W = 900;
  const H = 560;
  if (!design.sections.length) return null;
  const { map, scale } = fit(planBounds(design), 30, 30, W - 60, H - 60);
  const P = (poly) => poly.map(map).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const { stringOf, strings: strs } = design.electrical;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full bg-white">
      {design.sections.map((s) => (
        <g key={s.id}>
          <polygon points={P(s.poly)} fill="#f8fafc" stroke="#0f172a" strokeWidth="2.5" />
          {s.poly.map((a, i) => {
            const b = s.poly[(i + 1) % s.poly.length];
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            if (l * scale < 50) return null;
            const nx = (b.y - a.y) / l;
            const ny = -(b.x - a.x) / l;
            const m = map({ x: (a.x + b.x) / 2 + (nx * 14) / scale, y: (a.y + b.y) / 2 + (ny * 14) / scale });
            let deg = (-Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            if (deg > 90) deg -= 180;
            if (deg < -90) deg += 180;
            return (
              <text key={i} x={m.x} y={m.y} fontSize="11" textAnchor="middle" dominantBaseline="middle" fill="#334155" transform={`rotate(${deg} ${m.x} ${m.y})`}>
                {l.toFixed(2)} m
              </text>
            );
          })}
        </g>
      ))}
      {design.blocks.map((b) => (
        <polygon key={b.id} points={P(rectPoly(b.x, b.y, b.w, b.d, b.rot || 0))} fill="#e2e8f0" stroke="#64748b" strokeDasharray="4 3" />
      ))}
      {design.trees.map((t) => {
        const c = map(t);
        return <circle key={t.id} cx={c.x} cy={c.y} r={t.r * scale} fill="#dcfce7" stroke="#16a34a" strokeDasharray="4 3" />;
      })}
      {design.tables.filter((t) => t.valid).map((t) => (
        <g key={t.id}>
          {t.modules.map((m) => {
            const s = stringOf.get(m.id);
            return <polygon key={m.id} points={P(m.corners)} fill={strings && s != null ? strs[s].color : '#1e3a8a'} fillOpacity={strings ? 0.75 : 1} stroke="#fff" strokeWidth="0.7" />;
          })}
        </g>
      ))}
      <g transform={`translate(${W - 45} 55)`}>
        <polygon points="0,-26 9,5 0,-2 -9,5" fill="#ef4444" />
        <text y="20" textAnchor="middle" fontSize="13" fontWeight="700">N</text>
      </g>
      {strings && (
        <g transform={`translate(30 ${H - 16})`} fontSize="11">
          {strs.slice(0, 12).map((s, i) => (
            <g key={s.name} transform={`translate(${i * 68} 0)`}>
              <rect width="11" height="11" y="-10" fill={s.color} />
              <text x="15">{s.name} ({s.count})</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

export function SldSvg({ el, spec }) {
  const boxes = [
    [`PV Array`, `${el.strings.length} strings · ${el.kwp.toFixed(2)} kWp`, `${spec.watts} W modules`],
    ['DCDB', 'Fuses + DC SPD', `${el.strings.length} in`],
    ['Inverter', `${el.inverterCount} × ${el.inverter?.kw} kW`, `DC/AC ${el.dcAc?.toFixed(2)}`],
    ['ACDB', 'MCB + AC SPD', ''],
    ['Net Meter', 'Bi-directional', ''],
    ['Grid / Load', 'LT panel', ''],
  ];
  return (
    <svg viewBox="0 0 900 150" className="h-auto w-full bg-white">
      {boxes.map((b, i) => {
        const x = 10 + i * 148;
        return (
          <g key={b[0]}>
            <rect x={x} y="35" width="120" height="80" rx="6" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.5" />
            <text x={x + 60} y="62" textAnchor="middle" fontSize="13" fontWeight="700">{b[0]}</text>
            <text x={x + 60} y="82" textAnchor="middle" fontSize="10.5" fill="#475569">{b[1]}</text>
            <text x={x + 60} y="98" textAnchor="middle" fontSize="10.5" fill="#475569">{b[2]}</text>
            {i < boxes.length - 1 && (
              <>
                <line x1={x + 120} y1="75" x2={x + 148} y2="75" stroke={i < 2 ? '#dc2626' : '#2563eb'} strokeWidth="2" />
                <text x={x + 134} y="68" textAnchor="middle" fontSize="9" fill="#64748b">{i < 2 ? 'DC' : 'AC'}</text>
              </>
            )}
          </g>
        );
      })}
      <line x1="70" y1="115" x2="70" y2="138" stroke="#16a34a" strokeWidth="1.5" />
      <line x1="366" y1="115" x2="366" y2="138" stroke="#16a34a" strokeWidth="1.5" />
      <line x1="40" y1="138" x2="420" y2="138" stroke="#16a34a" strokeWidth="1.5" />
      <text x="430" y="142" fontSize="10" fill="#16a34a">Earthing</text>
    </svg>
  );
}

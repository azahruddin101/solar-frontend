'use client';

// Small live 3D sketch of the building, drawn from the same roof model the designer uses, so every
// change to shape, steepness, low side or ridge is visible immediately on the roof step.
import { useMemo } from 'react';
import { normSection, roofPlanes, roofZ } from '@/lib/model';

const W = 340;
const H = 190;
const TURN = (28 * Math.PI) / 180; // look from the south, turned a little so two walls show
const COS = Math.cos(TURN);
const SIN = Math.sin(TURN);

// plan (x east, y north) + height → screen. The viewer stands to the south, looking down.
const turn = (p) => ({ xr: p.x * COS - p.y * SIN, yr: p.x * SIN + p.y * COS });
const project = (p, z) => {
  const { xr, yr } = turn(p);
  return { x: xr, y: -yr * 0.5 - z * 0.82, depth: yr };
};

export default function RoofPreview({ section }) {
  const model = useMemo(() => {
    const sec = normSection(section);
    if (sec.poly.length < 3) return null;
    const flat = !sec.frame;
    const planes = flat ? [{ poly: sec.poly, azimuth: null }] : roofPlanes(sec);
    const fr = sec.frame;
    const onRidge = (p) => fr && sec.roofType === 'gable' && Math.abs(p.x * fr.f.x + p.y * fr.f.y - fr.dMid) < 1e-6;
    const faces = [];
    for (const pl of planes) {
      const top = pl.poly.map((p) => project(p, roofZ(sec, p.x, p.y)));
      // slopes turned towards the viewer are lit, the ones turned away are darker
      const towards = pl.azimuth == null ? 0.5 : (1 + Math.cos(((pl.azimuth - 180 - 28) * Math.PI) / 180)) / 2;
      faces.push({ kind: 'roof', pts: top, depth: Math.max(...top.map((t) => t.depth)) - 1e-3, shade: towards });
      pl.poly.forEach((a, i) => {
        const b = pl.poly[(i + 1) % pl.poly.length];
        if (onRidge(a) && onRidge(b)) return;
        // outward normal of a CCW edge; only walls facing the viewer are drawn
        const n = turn({ x: b.y - a.y, y: -(b.x - a.x) });
        if (n.yr >= 0) return;
        const pts = [project(a, 0), project(b, 0), project(b, roofZ(sec, b.x, b.y)), project(a, roofZ(sec, a.x, a.y))];
        const lowest = Math.min(...pl.poly.map((q) => roofZ(sec, q.x, q.y)));
        const low = fr && Math.abs(roofZ(sec, a.x, a.y) - lowest) < 1e-3 && Math.abs(roofZ(sec, b.x, b.y) - lowest) < 1e-3;
        faces.push({ kind: 'wall', pts, depth: (pts[0].depth + pts[1].depth) / 2, shade: n.xr > 0 ? 0.35 : 0.6, eave: low ? [pts[3], pts[2]] : null });
      });
    }
    faces.sort((p, q) => q.depth - p.depth); // far first
    const all = faces.flatMap((f) => f.pts);
    const minX = Math.min(...all.map((p) => p.x));
    const maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y));
    const maxY = Math.max(...all.map((p) => p.y));
    const k = Math.min((W - 40) / (maxX - minX || 1), (H - 36) / (maxY - minY || 1));
    const at = (p) => `${((p.x - (minX + maxX) / 2) * k + W / 2).toFixed(1)},${((p.y - (minY + maxY) / 2) * k + H / 2 + 4).toFixed(1)}`;
    return { faces, at, flat };
  }, [section]);

  if (!model) return null;
  const north = project({ x: 0, y: 1 }, 0);
  const nl = Math.hypot(north.x, north.y) || 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-gradient-to-b from-sky-100 to-slate-100" role="img" aria-label="3D preview of the roof">
      <ellipse cx={W / 2} cy={H - 16} rx={W * 0.36} ry={11} fill="#0f172a" opacity="0.12" />
      {model.faces.map((f, i) => (
        <g key={i}>
          <polygon
            points={f.pts.map(model.at).join(' ')}
            fill={f.kind === 'wall' ? `hsl(215 14% ${38 + f.shade * 30}%)` : model.flat ? '#d6d3d1' : `hsl(16 42% ${36 + f.shade * 24}%)`}
            stroke="#0f172a"
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {f.eave && <polyline points={f.eave.map(model.at).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="3.5" strokeLinecap="round" />}
        </g>
      ))}
      <g transform={`translate(${W - 24} 26)`}>
        <circle r="13" fill="#fff" opacity="0.85" />
        <line x1={(-north.x / nl) * 7} y1={(-north.y / nl) * 7} x2={(north.x / nl) * 8} y2={(north.y / nl) * 8} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
        <circle cx={(north.x / nl) * 8} cy={(north.y / nl) * 8} r="2.6" fill="#ef4444" />
        <text x={(north.x / nl) * 8 + 6} y={(north.y / nl) * 8 + 3} fontSize="8" fontWeight="700" fill="#0f172a">N</text>
      </g>
    </svg>
  );
}

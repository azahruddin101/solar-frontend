'use client';

import { fitPlan, niceScaleLength } from '@/lib/report';

const W = 640;
const H = 420;

export default function PlanSvg({ plan }) {
  const { map, scale } = fitPlan(plan.bounds, 20, 20, W - 40, H - 40, 0.14);
  const pts = (poly) => poly.map((p) => map(p)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const bar = niceScaleLength(scale, 110);
  const showNumbers = plan.panels.length <= 60 && scale > 14;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg bg-white" role="img" aria-label="Roof layout plan">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#eef2f7" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {plan.outline !== plan.footprint && <polygon points={pts(plan.outline)} fill="none" stroke="#94a3b8" strokeDasharray="4 3" />}
      <polygon points={pts(plan.footprint)} fill="#f1f5f9" stroke="#0f172a" strokeWidth="2" />
      {plan.faces.map((f, i) => (
        <polygon key={i} points={pts(f)} fill="none" stroke="#94a3b8" strokeWidth="1" />
      ))}
      {plan.panels.map((p) => {
        const c = p.corners.map(map);
        const mid = { x: c.reduce((s, q) => s + q.x, 0) / 4, y: c.reduce((s, q) => s + q.y, 0) / 4 };
        return (
          <g key={p.id}>
            <polygon points={pts(p.corners)} fill={p.valid ? '#1e3a5f' : '#ef4444'} stroke="#ffffff" strokeWidth="0.8" />
            {showNumbers && (
              <text x={mid.x} y={mid.y + 3} textAnchor="middle" fontSize="8" fill="#cbd5e1">
                {p.n}
              </text>
            )}
          </g>
        );
      })}
      {plan.edgeLabels.map((e, i) => {
        const p = map({ x: e.mid.x + e.outward.x * (14 / scale), y: e.mid.y + e.outward.y * (14 / scale) });
        let deg = (-e.angle * 180) / Math.PI;
        if (deg > 90) deg -= 180;
        if (deg < -90) deg += 180;
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#334155" transform={`rotate(${deg} ${p.x} ${p.y})`}>
            {e.text}
          </text>
        );
      })}
      <g transform={`translate(${W - 40} 46)`}>
        <polygon points="0,-24 8,4 0,-2 -8,4" fill="#ef4444" />
        <text y="18" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">
          N
        </text>
      </g>
      <g transform={`translate(24 ${H - 22})`}>
        <rect width={bar * scale} height="6" fill="#0f172a" />
        <rect width={(bar * scale) / 2} height="6" fill="#ffffff" stroke="#0f172a" />
        <text y="-5" fontSize="11" fill="#334155">
          0
        </text>
        <text x={bar * scale} y="-5" fontSize="11" fill="#334155" textAnchor="end">
          {bar} m
        </text>
      </g>
    </svg>
  );
}

'use client';

import { formatNumber } from '@/lib/energy';
import { MONTHS } from '@/lib/sun';

export default function MonthlyChart({ monthly }) {
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 10, t: 16, b: 26 };
  const max = Math.max(1, ...monthly);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / 12;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = [0, top / 2, top];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Monthly energy production">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#64748b">
            {formatNumber(t)}
          </text>
        </g>
      ))}
      {monthly.map((v, i) => (
        <g key={MONTHS[i]}>
          <rect x={pad.l + i * bw + bw * 0.18} y={y(v)} width={bw * 0.64} height={Math.max(0, y(0) - y(v))} rx="3" fill="#f59e0b">
            <title>
              {MONTHS[i]}: {formatNumber(v)} kWh
            </title>
          </rect>
          <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">
            {MONTHS[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

'use client';

import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, formatNumber } from '@/lib/energy';
import { compassLabel } from '@/lib/geo';
import { useReport } from '@/lib/useReport';
import MonthlyChart from './MonthlyChart';
import PlanSvg from './PlanSvg';

function Kpi({ label, value, unit, accent }) {
  return (
    <div className={accent ? 'rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200' : 'rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200'}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
        {value} {unit && <span className="text-xs font-normal text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function H({ children }) {
  return <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}

function SiteImage({ url }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="grid aspect-square place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">
        <div className="flex flex-col items-center gap-1">
          <ImageOff className="h-5 w-5" /> Satellite image unavailable
        </div>
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Satellite view of the site" className="aspect-square w-full rounded-lg object-cover" onError={() => setFailed(true)} />;
}

export default function ReportView({ design }) {
  const r = useReport(design);
  if (!r) return null;
  const f = r.finance;
  const money = (v) => formatMoney(v, r.currency);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-slate-200/70 p-4 lg:p-8">
      <article className="mx-auto max-w-4xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        <header className="rounded-t-2xl bg-slate-900 px-8 py-6 text-white">
          <div className="text-xs uppercase tracking-widest text-amber-400">Rooftop solar plan</div>
          <h1 className="mt-1 text-2xl font-semibold">{r.title}</h1>
          <p className="mt-1 text-sm text-slate-300">{r.place?.address || `${r.origin.lat.toFixed(5)}, ${r.origin.lng.toFixed(5)}`}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
            {r.customer && <span>Customer: {r.customer}</span>}
            {r.preparedBy && <span>Prepared by: {r.preparedBy}</span>}
            <span>{r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </header>

        <div className="px-8 pb-10 pt-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="System size" value={r.totals.kwp.toFixed(2)} unit="kWp" accent />
            <Kpi label="Panels" value={r.totals.count} unit={`× ${r.spec.watts} W`} />
            <Kpi label="Annual energy" value={formatNumber(r.totals.acKwh)} unit="kWh" accent />
            <Kpi label="Specific yield" value={formatNumber(r.totals.specificYield)} unit="kWh/kWp" />
            <Kpi label="System cost" value={money(f.cost)} />
            <Kpi label="Year-1 savings" value={money(f.firstYearSavings)} />
            <Kpi label="Payback" value={f.payback ? f.payback.toFixed(1) : '> 25'} unit="years" />
            <Kpi label="CO₂ avoided" value={(r.co2Kg / 1000).toFixed(1)} unit="t / year" />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="md:col-span-3">
              {r.snapshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.snapshot} alt="3D model of the building with panels" className="w-full rounded-lg ring-1 ring-slate-200" />
              ) : (
                <div className="grid aspect-video place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">No 3D snapshot — return to the design step to capture one</div>
              )}
              <p className="mt-1.5 text-xs text-slate-400">3D model</p>
            </div>
            <div className="md:col-span-2">
              <SiteImage url={r.siteImageUrl} />
              <p className="mt-1.5 text-xs text-slate-400">Site (satellite) with roof outline</p>
            </div>
          </div>

          <H>Roof layout plan</H>
          <div className="rounded-xl p-2 ring-1 ring-slate-200">
            <PlanSvg plan={r.plan} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Footprint</div>
              {r.footprintArea.toFixed(1)} m²
            </div>
            <div>
              <div className="text-xs text-slate-500">Roof type</div>
              <span className="capitalize">{r.roof.type}</span>
              {r.roof.pitch > 0 ? `, ${r.roof.pitch}°` : ''}
            </div>
            <div>
              <div className="text-xs text-slate-500">Building height</div>
              {r.roof.ridgeH.toFixed(1)} m ({r.building.floors} floor{r.building.floors > 1 ? 's' : ''})
            </div>
            <div>
              <div className="text-xs text-slate-500">Panel coverage</div>
              {(r.coverage * 100).toFixed(0)}% of footprint
            </div>
          </div>

          <H>Array configuration</H>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 font-medium">Panels</th>
                <th className="py-2 font-medium">Tilt</th>
                <th className="py-2 font-medium">Facing</th>
                <th className="py-2 text-right font-medium">Capacity</th>
                <th className="py-2 text-right font-medium">Energy / yr</th>
                <th className="py-2 text-right font-medium">Orientation eff.</th>
              </tr>
            </thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={`${g.tilt}-${g.azimuth}`} className="border-b border-slate-100">
                  <td className="py-2">{g.count}</td>
                  <td className="py-2">{g.tilt}°</td>
                  <td className="py-2">{g.direction}</td>
                  <td className="py-2 text-right tabular-nums">{g.kwp.toFixed(2)} kWp</td>
                  <td className="py-2 text-right tabular-nums">{formatNumber(g.acKwh)} kWh</td>
                  <td className="py-2 text-right tabular-nums">{g.efficiency ? `${(g.efficiency * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <H>Monthly production (kWh)</H>
          <MonthlyChart monthly={r.totals.monthly} />

          <H>Financial outlook ({r.currency})</H>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 font-medium">Year</th>
                <th className="py-2 text-right font-medium">Energy</th>
                <th className="py-2 text-right font-medium">Tariff</th>
                <th className="py-2 text-right font-medium">Savings</th>
                <th className="py-2 text-right font-medium">Cumulative net</th>
              </tr>
            </thead>
            <tbody>
              {f.rows
                .filter((row) => [1, 5, 10, 15, 20, 25].includes(row.year))
                .map((row) => (
                  <tr key={row.year} className="border-b border-slate-100">
                    <td className="py-2">{row.year}</td>
                    <td className="py-2 text-right tabular-nums">{formatNumber(row.energy)} kWh</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(row.rate, r.currency, { decimals: 2 })}</td>
                    <td className="py-2 text-right tabular-nums">{money(row.savings)}</td>
                    <td className={`py-2 text-right tabular-nums ${row.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{money(row.net)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            25-year savings {money(f.lifetimeSavings)} on an investment of {money(f.cost)} · ROI {f.roi.toFixed(0)}% · ≈ {formatNumber(r.trees)} trees
            planted per year equivalent.
          </p>

          {r.solar && (
            <>
              <H>Google Solar API analysis</H>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500">Imagery quality</div>
                  {r.solar.quality}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Max panels (Google)</div>
                  {formatNumber(r.solar.maxPanels)}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Peak sunshine</div>
                  {formatNumber(r.solar.maxSunshine)} h/yr
                </div>
                <div>
                  <div className="text-xs text-slate-500">Roof area (Google)</div>
                  {formatNumber(r.solar.roofArea)} m²
                </div>
              </div>
              {r.solar.segments.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {r.solar.segments.length} roof segments detected:{' '}
                  {r.solar.segments
                    .slice(0, 6)
                    .map((s) => `${s.pitch.toFixed(0)}° ${compassLabel(s.azimuth)} (${s.area.toFixed(0)} m²)`)
                    .join(', ')}
                  {r.solar.segments.length > 6 ? '…' : ''}
                </p>
              )}
            </>
          )}

          <H>Assumptions</H>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>
              Yield {r.yieldSource === 'google' ? 'calibrated with Google Solar API sunshine quantiles for this roof' : 'estimated with a clear-sky sun-path model and a regional cloudiness factor'}; orientation effects use hourly sun positions for latitude {r.origin.lat.toFixed(2)}°.
            </li>
            <li>
              System efficiency {r.finance.efficiency}% (inverter, wiring, soiling, temperature). Panel degradation {r.finance.degradation}%/yr, tariff escalation {r.finance.escalation}%/yr.
            </li>
            <li>Shading from nearby trees/buildings and between panel rows is not modelled beyond the Solar API calibration. Verify on site before installation.</li>
          </ul>
        </div>
      </article>
    </div>
  );
}

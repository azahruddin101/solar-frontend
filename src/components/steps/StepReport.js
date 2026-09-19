'use client';

import { Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, formatNumber } from '@/lib/energy';
import { generatePdf } from '@/lib/pdf';
import { useSession } from '@/lib/session';
import { useStore } from '@/lib/store';
import { MONTHS } from '@/lib/sun';
import { FormPage, Label } from './common';
import { LayoutSvg } from './Drawings';

export default function StepReport({ design }) {
  const { project, place, finance, snapshot } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { totals, fin } = design;
  const money = (v) => formatMoney(v, finance.currency);
  const max = Math.max(1, ...totals.monthly);
  const download = async () => {
    setBusy(true);
    setErr('');
    try {
      await generatePdf({ design, project, place, finance, snapshot, company: useSession.getState().company, client: useStore.getState().client, designId: useStore.getState().designId });
    } catch (e) {
      console.error(e);
      setErr(e.message);
    }
    setBusy(false);
  };
  const kpis = [['System size', `${totals.kwp.toFixed(2)} kWp`], ['Modules', totals.count], ['Annual energy', `${formatNumber(totals.acKwh)} kWh`], ['Shading loss', `${totals.shadeLossPct.toFixed(1)}%`], ['System cost', money(fin.cost)], ['Payback', fin.payback ? `${fin.payback.toFixed(1)} yrs` : '> 25 yrs']];
  return (
    <FormPage icon={FileText} title="Report & Engineering Drawings" wide>
      <button type="button" onClick={download} disabled={busy || !totals.count} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-[#0f172a] text-[16px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download PDF (summary, PV layout, string layout, SLD, BOM, financials)
      </button>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map(([l, v]) => (
          <div key={l} className="rounded-lg bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-wide text-slate-400">{l}</div>
            <div className="mt-1 text-lg font-bold">{v}</div>
          </div>
        ))}
      </div>
      {snapshot && (
        <div>
          <Label>3D model</Label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={snapshot} alt="3D model" className="w-full rounded-lg" />
        </div>
      )}
      <div>
        <Label>PV array layout</Label>
        <div className="overflow-hidden rounded-lg border border-slate-200"><LayoutSvg design={design} strings={false} /></div>
      </div>
      <div>
        <Label>Monthly production (kWh)</Label>
        <div className="flex h-44 items-end gap-2 rounded-lg border border-slate-200 p-4">
          {totals.monthly.map((v, i) => (
            <div key={MONTHS[i]} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-slate-500">
              <span>{formatNumber(v)}</span>
              <div className="w-full rounded-t bg-brand" style={{ height: `${(v / max) * 110}px` }} />
              <span>{MONTHS[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </FormPage>
  );
}

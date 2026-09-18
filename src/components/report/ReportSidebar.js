'use client';

import { ArrowLeft, Download, FileText, Wallet, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CURRENCIES, formatMoney, formatNumber, guessCurrency } from '@/lib/energy';
import { generatePdf } from '@/lib/pdf';
import { useStore } from '@/lib/store';
import { useReport } from '@/lib/useReport';
import { Button, Field, Notice, NumberInput, Section, Stat, TextInput } from '../ui';

export default function ReportSidebar({ design }) {
  const finance = useStore((s) => s.finance);
  const financeInit = useStore((s) => s.financeInit);
  const updateFinance = useStore((s) => s.updateFinance);
  const report = useStore((s) => s.report);
  const updateReport = useStore((s) => s.updateReport);
  const setStep = useStore((s) => s.setStep);
  const r = useReport(design);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // pick a sensible currency the first time the report opens
  useEffect(() => {
    if (financeInit || !design.origin) return;
    const code = guessCurrency(design.solarData?.regionCode, design.origin.lat, design.origin.lng);
    const c = CURRENCIES[code];
    updateFinance({ currency: code, tariff: c.tariff, costPerKw: c.costPerKw });
  }, [financeInit, design.origin, design.solarData, updateFinance]);

  if (!r) return null;

  const download = async () => {
    setBusy(true);
    setError('');
    try {
      await generatePdf(r);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Could not create the PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <h2 className="text-lg font-semibold">Plan &amp; report</h2>
        <p className="mt-1 text-sm text-slate-500">Add project details and financial assumptions, then download the PDF plan.</p>
      </div>

      <Section title="Project" icon={FileText}>
        <div className="space-y-3">
          <Field label="Project name">
            <TextInput value={report.projectName} placeholder="Rooftop Solar Plan" onChange={(projectName) => updateReport({ projectName })} />
          </Field>
          <Field label="Customer">
            <TextInput value={report.customerName} placeholder="Optional" onChange={(customerName) => updateReport({ customerName })} />
          </Field>
          <Field label="Prepared by">
            <TextInput value={report.preparedBy} placeholder="Optional" onChange={(preparedBy) => updateReport({ preparedBy })} />
          </Field>
        </div>
      </Section>

      <Section title="Financial assumptions" icon={Wallet}>
        <div className="space-y-3">
          <Field label="Currency">
            <select
              value={finance.currency}
              onChange={(e) => {
                const c = CURRENCIES[e.target.value];
                updateFinance({ currency: c.code, tariff: c.tariff, costPerKw: c.costPerKw });
              }}
              className="h-9 w-full rounded-lg bg-white px-2.5 text-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-amber-400"
            >
              {Object.values(CURRENCIES).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol.trim()})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Electricity tariff">
              <NumberInput value={finance.tariff} step={0.01} min={0} suffix="/kWh" onChange={(tariff) => updateFinance({ tariff: Math.max(0, tariff) })} />
            </Field>
            <Field label="Installed cost">
              <NumberInput value={finance.costPerKw} step={100} min={0} suffix="/kWp" onChange={(costPerKw) => updateFinance({ costPerKw: Math.max(0, costPerKw) })} />
            </Field>
            <Field label="System efficiency">
              <NumberInput value={finance.efficiency} step={1} min={50} max={100} suffix="%" onChange={(efficiency) => updateFinance({ efficiency: Math.min(100, Math.max(50, efficiency)) })} />
            </Field>
            <Field label="Tariff increase">
              <NumberInput value={finance.escalation} step={0.5} min={0} max={20} suffix="%/yr" onChange={(escalation) => updateFinance({ escalation: Math.min(20, Math.max(0, escalation)) })} />
            </Field>
            <Field label="Degradation">
              <NumberInput value={finance.degradation} step={0.1} min={0} max={3} suffix="%/yr" onChange={(degradation) => updateFinance({ degradation: Math.min(3, Math.max(0, degradation)) })} />
            </Field>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-0 mt-auto border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="System" value={r.totals.kwp.toFixed(2)} unit="kWp" />
          <Stat label="Energy" value={formatNumber(r.totals.acKwh)} unit="kWh" />
          <Stat label="Payback" value={r.finance.payback ? r.finance.payback.toFixed(1) : '>25'} unit="yr" tone="accent" />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Investment {formatMoney(r.finance.cost, r.currency)} · 25-yr savings {formatMoney(r.finance.lifetimeSavings, r.currency)}
        </p>
        {error && (
          <Notice tone="error" className="mt-2">
            {error}
          </Notice>
        )}
        <Button variant="primary" size="lg" className="mt-3 w-full" icon={busy ? Loader2 : Download} disabled={busy} onClick={download}>
          {busy ? 'Creating PDF…' : 'Download PDF plan'}
        </Button>
        <Button variant="ghost" size="sm" className="mt-2 w-full" icon={ArrowLeft} onClick={() => setStep(2)}>
          Back to 3D design
        </Button>
      </div>
    </div>
  );
}

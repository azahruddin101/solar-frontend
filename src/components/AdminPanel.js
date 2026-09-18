'use client';

import { Boxes, Download, FileSpreadsheet, LogOut, PanelsTopLeft, Plus, Save, Settings, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PILLAR_SHAPES } from '@/lib/catalog';
import { CURRENCIES } from '@/lib/energy';
import { exportPanels, exportPoles, importPanels, importPoles } from '@/lib/excel';

const inp = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
const btn = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50';
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const Th = ({ children, className = '' }) => <th className={`border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</th>;

function ImportButton({ onFile, label }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.csv" hidden onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; }} />
      <button type="button" className={btn} onClick={() => ref.current.click()}><Upload className="h-4 w-4" /> {label}</button>
    </>
  );
}

export default function AdminPanel() {
  const [pw, setPw] = useState('');
  const [cat, setCat] = useState(null);
  const [tab, setTab] = useState('panels');
  const [msg, setMsg] = useState(null); // {tone, text}
  const [dirty, setDirty] = useState(false);

  const load = async (password) => {
    const r = await fetch('/api/catalog', { method: 'POST', headers: { 'x-admin-password': password } });
    if (!r.ok) return false;
    setCat(await (await fetch('/api/catalog')).json());
    sessionStorage.setItem('adminpw', password);
    setPw(password);
    return true;
  };
  useEffect(() => {
    const saved = sessionStorage.getItem('adminpw');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) load(saved);
  }, []);

  const change = (next) => { setCat(next); setDirty(true); };
  const save = async () => {
    const r = await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }, body: JSON.stringify(cat) });
    const body = await r.json();
    if (r.ok) { setCat(body); setDirty(false); }
    setMsg(r.ok ? { tone: 'ok', text: 'Catalog saved. New prices are live for all users.' } : { tone: 'err', text: body.error });
  };
  const row = (key, id, patch) => change({ ...cat, [key]: cat[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const del = (key, id) => change({ ...cat, [key]: cat[key].filter((x) => x.id !== id) });

  const onImport = async (kind, file) => {
    try {
      const { items, errors } = await (kind === 'panels' ? importPanels(file) : importPoles(file));
      const keyOf = kind === 'panels' ? (p) => `${p.brand}|${p.model}|${p.watts}`.toLowerCase() : (p) => p.name.toLowerCase();
      const list = [...cat[kind]];
      let added = 0;
      let updated = 0;
      for (const it of items) {
        const i = list.findIndex((x) => keyOf(x) === keyOf(it));
        if (i >= 0) { list[i] = { ...list[i], ...Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined)) }; updated++; }
        else { list.push({ id: uid(kind === 'panels' ? 'p' : 'pl'), length: 1.9, width: 1.05, ...Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined)) }); added++; }
      }
      change({ ...cat, [kind]: list });
      setMsg({ tone: errors.length ? 'warn' : 'ok', text: `Imported ${file.name}: ${added} added, ${updated} updated${errors.length ? ` · skipped — ${errors.slice(0, 3).join('; ')}` : ''}. Review and press Save.` });
    } catch (e) {
      setMsg({ tone: 'err', text: e.message });
    }
  };

  if (!cat)
    return (
      <div className="grid h-dvh place-items-center bg-slate-100">
        <form onSubmit={async (e) => { e.preventDefault(); if (!(await load(pw))) setMsg({ tone: 'err', text: 'Incorrect password' }); }} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold">Admin console</h1>
            <p className="text-sm text-slate-500">Sign in to manage products and pricing.</p>
          </div>
          <label className="block text-sm font-medium">Password
            <input type="password" autoFocus className={`${inp} mt-1 h-10`} value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          {msg && <p role="alert" className="text-sm text-red-600">{msg.text}</p>}
          <button className="h-10 w-full rounded-md bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800">Sign in</button>
        </form>
      </div>
    );

  const brands = [...new Set(cat.panels.map((p) => p.brand || 'Unbranded'))];
  const tabs = [['panels', PanelsTopLeft, 'Solar panels', cat.panels.length], ['pillars', Boxes, 'Poles / pillars', cat.pillars.length], ['settings', Settings, 'Pricing settings', null]];

  return (
    <div className="flex h-dvh bg-slate-100 text-slate-900">
      <nav aria-label="Admin sections" className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-sm font-semibold">Solar Planner</div>
          <div className="text-xs text-slate-500">Admin console</div>
        </div>
        <div className="flex-1 space-y-1 p-3">
          {tabs.map(([k, Icon, label, n]) => (
            <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)} className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${tab === k ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" /> <span className="flex-1 text-left">{label}</span>
              {n !== null && <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500">{n}</span>}
            </button>
          ))}
        </div>
        <div className="space-y-1 border-t border-slate-200 p-3 text-sm">
          <Link href="/" className="block rounded-md px-3 py-2 text-slate-600 hover:bg-slate-50">← Back to planner</Link>
          <button type="button" onClick={() => { sessionStorage.removeItem('adminpw'); setCat(null); setPw(''); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <h1 className="text-lg font-semibold">{tabs.find((t) => t[0] === tab)[2]}</h1>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
            <button type="button" onClick={save} disabled={!dirty} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-slate-300"><Save className="h-4 w-4" /> Save changes</button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-8">
          {msg && <div role="status" className={`rounded-md border px-4 py-2.5 text-sm ${msg.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : msg.tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{msg.text}</div>}

          {tab === 'panels' && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                <div className="mr-auto text-sm"><b>Bulk upload</b> <span className="text-slate-500">— Excel (.xlsx) or CSV with columns: Brand, Model, Watt, Length (m), Width (m), Price per panel. Existing models are updated, new ones added.</span></div>
                <ImportButton label="Upload Excel" onFile={(f) => onImport('panels', f)} />
                <button type="button" className={btn} onClick={() => exportPanels(cat.panels)}><Download className="h-4 w-4" /> Download current / template</button>
              </div>
              {brands.map((brand) => (
                <section key={brand} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                    <input aria-label="Brand name" className="h-8 rounded-md border border-transparent px-2 text-base font-semibold hover:border-slate-300 focus:border-blue-600 focus:outline-none" defaultValue={brand} onBlur={(e) => e.target.value !== brand && change({ ...cat, panels: cat.panels.map((p) => ((p.brand || 'Unbranded') === brand ? { ...p, brand: e.target.value } : p)) })} />
                    <span className="text-xs text-slate-500">{cat.panels.filter((p) => (p.brand || 'Unbranded') === brand).length} models</span>
                    <button type="button" className={`${btn} ml-auto h-8`} onClick={() => change({ ...cat, panels: [...cat.panels, { id: uid('p'), brand, model: '', watts: 400, length: 1.9, width: 1.05, price: 0 }] })}><Plus className="h-4 w-4" /> Add model</button>
                  </div>
                  <table className="w-full">
                    <thead><tr><Th>Model</Th><Th className="w-28">Watt</Th><Th className="w-28">Length (m)</Th><Th className="w-28">Width (m)</Th><Th className="w-40">Price / panel ({cat.currency})</Th><Th className="w-12" /></tr></thead>
                    <tbody>
                      {cat.panels.filter((p) => (p.brand || 'Unbranded') === brand).map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0">
                          <td className="p-2"><input aria-label="Model" className={inp} value={p.model} onChange={(e) => row('panels', p.id, { model: e.target.value })} /></td>
                          {['watts', 'length', 'width', 'price'].map((k) => <td key={k} className="p-2"><input aria-label={k} type="number" step="any" className={inp} value={p[k]} onChange={(e) => row('panels', p.id, { [k]: e.target.value })} /></td>)}
                          <td className="p-2"><button type="button" aria-label={`Delete ${p.model}`} onClick={() => del('panels', p.id)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              <button type="button" className={btn} onClick={() => change({ ...cat, panels: [...cat.panels, { id: uid('p'), brand: `New brand ${brands.length + 1}`, model: '', watts: 400, length: 1.9, width: 1.05, price: 0 }] })}><Plus className="h-4 w-4" /> Add brand</button>
            </>
          )}

          {tab === 'pillars' && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
                <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                <div className="mr-auto text-sm"><b>Bulk upload</b> <span className="text-slate-500">— columns: Name / material, Type (L-shape, Cylindrical or Square), Price per foot.</span></div>
                <ImportButton label="Upload Excel" onFile={(f) => onImport('pillars', f)} />
                <button type="button" className={btn} onClick={() => exportPoles(cat.pillars)}><Download className="h-4 w-4" /> Download current / template</button>
              </div>
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full">
                  <thead><tr><Th>Name / material</Th><Th className="w-64">Type</Th><Th className="w-44">Price / foot ({cat.currency})</Th><Th className="w-12" /></tr></thead>
                  <tbody>
                    {cat.pillars.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 last:border-0">
                        <td className="p-2"><input aria-label="Name" className={inp} value={p.name} onChange={(e) => row('pillars', p.id, { name: e.target.value })} /></td>
                        <td className="p-2"><select aria-label="Type" className={inp} value={p.shape} onChange={(e) => row('pillars', p.id, { shape: e.target.value })}>{PILLAR_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></td>
                        <td className="p-2"><input aria-label="Price per foot" type="number" step="any" className={inp} value={p.pricePerFt} onChange={(e) => row('pillars', p.id, { pricePerFt: e.target.value })} /></td>
                        <td className="p-2"><button type="button" aria-label={`Delete ${p.name}`} onClick={() => del('pillars', p.id)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <button type="button" className={btn} onClick={() => change({ ...cat, pillars: [...cat.pillars, { id: uid('pl'), name: '', shape: 'square', pricePerFt: 0 }] })}><Plus className="h-4 w-4" /> Add pole</button>
            </>
          )}

          {tab === 'settings' && (
            <section className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-6">
              <label className="block text-sm font-medium">Currency
                <select className={`${inp} mt-1`} value={cat.currency} onChange={(e) => change({ ...cat, currency: e.target.value })}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="block text-sm font-medium">Electricity price per unit (kWh)
                <input type="number" step="any" className={`${inp} mt-1`} value={cat.tariff} onChange={(e) => change({ ...cat, tariff: e.target.value })} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Used to convert a customer’s bill into units and to calculate savings.</span>
              </label>
              <label className="block text-sm font-medium">Balance-of-system cost per kW
                <input type="number" step="any" className={`${inp} mt-1`} value={cat.otherCostPerKw} onChange={(e) => change({ ...cat, otherCostPerKw: e.target.value })} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Inverter, cabling, protection, installation labour — added on top of panels and poles.</span>
              </label>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

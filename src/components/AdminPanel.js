'use client';

import { Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PILLAR_SHAPES } from '@/lib/catalog';
import { CURRENCIES } from '@/lib/energy';

const inp = 'h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-600';
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const Th = ({ children }) => <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500">{children}</th>;

export default function AdminPanel() {
  const [pw, setPw] = useState('');
  const [cat, setCat] = useState(null);
  const [msg, setMsg] = useState('');

  const login = async (e) => {
    e.preventDefault();
    const r = await fetch('/api/catalog', { method: 'POST', headers: { 'x-admin-password': pw } });
    if (!r.ok) return setMsg('Wrong password');
    setCat(await (await fetch('/api/catalog')).json());
    setMsg('');
  };
  const save = async () => {
    const r = await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-password': pw }, body: JSON.stringify(cat) });
    const body = await r.json();
    if (r.ok) setCat(body);
    setMsg(r.ok ? 'Saved ✓ — customers see the new prices on their next page load.' : body.error);
  };
  const row = (key, id, patch) => setCat({ ...cat, [key]: cat[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const del = (key, id) => setCat({ ...cat, [key]: cat[key].filter((x) => x.id !== id) });

  if (!cat)
    return (
      <form onSubmit={login} className="mx-auto mt-32 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Admin login</h1>
        <input type="password" autoFocus className={inp} placeholder="Admin password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <button className="h-10 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white">Sign in</button>
        <p className="text-xs text-slate-400">Set ADMIN_PASSWORD in .env.local (default: admin123).</p>
      </form>
    );

  return (
    <div className="h-dvh overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Product catalog</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to planner</Link>
          </div>
          <button type="button" onClick={save} className="flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white">
            <Save className="h-4 w-4" /> Save changes
          </button>
        </div>
        {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-semibold">General</h2>
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm">Currency
              <select className={inp} value={cat.currency} onChange={(e) => setCat({ ...cat, currency: e.target.value })}>
                {Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm">Electricity price per unit (kWh)
              <input type="number" className={inp} value={cat.tariff} onChange={(e) => setCat({ ...cat, tariff: e.target.value })} />
            </label>
            <label className="text-sm">Other cost per kW (inverter, wiring, labour)
              <input type="number" className={inp} value={cat.otherCostPerKw} onChange={(e) => setCat({ ...cat, otherCostPerKw: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Solar panels <span className="text-sm font-normal text-slate-400">— price per panel</span></h2>
            <button type="button" onClick={() => setCat({ ...cat, panels: [...cat.panels, { id: uid('p'), brand: '', model: '', watts: 400, length: 1.9, width: 1.05, price: 0 }] })} className="flex items-center gap-1 text-sm font-medium text-blue-600"><Plus className="h-4 w-4" /> Add panel</button>
          </div>
          <table className="w-full">
            <thead><tr><Th>Brand</Th><Th>Model</Th><Th>Watt</Th><Th>Length (m)</Th><Th>Width (m)</Th><Th>Price / panel</Th><Th /></tr></thead>
            <tbody>
              {cat.panels.map((p) => (
                <tr key={p.id}>
                  {['brand', 'model'].map((k) => <td key={k} className="p-1"><input className={inp} value={p[k]} onChange={(e) => row('panels', p.id, { [k]: e.target.value })} /></td>)}
                  {['watts', 'length', 'width', 'price'].map((k) => <td key={k} className="p-1"><input type="number" step="any" className={inp} value={p[k]} onChange={(e) => row('panels', p.id, { [k]: e.target.value })} /></td>)}
                  <td className="p-1"><button type="button" onClick={() => del('panels', p.id)} className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pillars <span className="text-sm font-normal text-slate-400">— price per foot</span></h2>
            <button type="button" onClick={() => setCat({ ...cat, pillars: [...cat.pillars, { id: uid('pl'), name: '', shape: 'square', pricePerFt: 0 }] })} className="flex items-center gap-1 text-sm font-medium text-blue-600"><Plus className="h-4 w-4" /> Add pillar</button>
          </div>
          <table className="w-full">
            <thead><tr><Th>Name / material</Th><Th>Type</Th><Th>Price / foot</Th><Th /></tr></thead>
            <tbody>
              {cat.pillars.map((p) => (
                <tr key={p.id}>
                  <td className="p-1"><input className={inp} value={p.name} onChange={(e) => row('pillars', p.id, { name: e.target.value })} /></td>
                  <td className="p-1">
                    <select className={inp} value={p.shape} onChange={(e) => row('pillars', p.id, { shape: e.target.value })}>
                      {PILLAR_SHAPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="p-1"><input type="number" step="any" className={inp} value={p.pricePerFt} onChange={(e) => row('pillars', p.id, { pricePerFt: e.target.value })} /></td>
                  <td className="p-1"><button type="button" onClick={() => del('pillars', p.id)} className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

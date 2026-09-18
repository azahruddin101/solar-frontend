'use client';

import { ArrowRight, Box, FileText, MapPin, PenLine, Settings, Sun } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    try {
      const st = JSON.parse(localStorage.getItem('solar-planner-v2') || 'null')?.state;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (st?.origin) setSaved(st);
    } catch {
      /* ignore */
    }
  }, []);
  const steps = [[MapPin, 'Locate the building', 'Search the address on satellite imagery.'], [PenLine, 'Mark the roof', 'Trace the roof and anything standing on it.'], [Box, 'Design in 3D', 'Panels are arranged automatically; adjust tilt, height and groups.'], [FileText, 'Get the proposal', 'Energy, savings, bill of materials and PDF drawings.']];
  return (
    <div className="h-dvh overflow-y-auto bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-md bg-blue-700 text-white"><Sun className="h-5 w-5" /></span> Solar Planner</div>
          <Link href="/admin" className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><Settings className="h-4 w-4" /> Admin console</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">Rooftop solar design and proposals in minutes</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">Size a system from the customer’s electricity bill, lay out panels on the real roof in 3D, and hand over a priced plan with structure quantities.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/design/location?new=1" className="inline-flex h-12 items-center gap-2 rounded-md bg-blue-700 px-6 text-base font-semibold text-white hover:bg-blue-800">Start a new project <ArrowRight className="h-5 w-5" /></Link>
          {saved && <Link href="/design/location" className="inline-flex h-12 items-center rounded-md border border-slate-300 bg-white px-6 text-base font-semibold hover:bg-slate-50">Continue: {saved.place?.address?.split(',')[0] || 'last project'}</Link>}
        </div>
        <ol className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([Icon, t, d], i) => (
            <li key={t} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Icon className="h-5 w-5" /> Step {i + 1}</div>
              <div className="mt-2 font-semibold">{t}</div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

'use client';

import { ArrowRight, MapPin, Search, Sparkles } from 'lucide-react';
import { loadSampleProject } from '@/lib/actions';
import { useStore } from '@/lib/store';
import { Button, Section } from '../ui';
import PlaceSearch from './PlaceSearch';
import SolarInsights from './SolarInsights';

export default function LocateSidebar() {
  const place = useStore((s) => s.place);
  const setPlace = useStore((s) => s.setPlace);
  const setStep = useStore((s) => s.setStep);
  const closed = useStore((s) => s.closed);
  const clearPolygon = useStore((s) => s.clearPolygon);

  return (
    <div>
      <div className="px-5 pb-4 pt-5">
        <h2 className="text-lg font-semibold">Find your building</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search an address and we&apos;ll fetch Google&apos;s rooftop solar analysis for the building.
        </p>
      </div>
      <Section title="Location" icon={Search}>
        <PlaceSearch
          onSelect={(p) => {
            if (closed) clearPolygon();
            setPlace(p);
          }}
        />
        {place && (
          <div className="mt-4 flex gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 text-sm">
              <div className="font-medium text-slate-800">{place.name}</div>
              <div className="text-xs text-slate-500">{place.address}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">
                {place.location.lat.toFixed(6)}, {place.location.lng.toFixed(6)}
              </div>
            </div>
          </div>
        )}
        <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!place} icon={ArrowRight} onClick={() => setStep(1)}>
          Next: outline the roof
        </Button>
      </Section>
      <SolarInsights />
      <div className="px-5 py-5">
        <button type="button" onClick={loadSampleProject} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-700">
          <Sparkles className="h-3.5 w-3.5" /> or explore the 3D designer with a sample building
        </button>
      </div>
    </div>
  );
}

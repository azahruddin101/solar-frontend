'use client';

import { CheckCircle2, ChevronDown, Loader2, MapPin, Maximize, Minus, Plus, Search, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { importLibrary, MAPS_API_KEY } from '@/lib/googleMaps';
import { useStore } from '@/lib/store';
import PlaceSearch from '../map/PlaceSearch';
import { cx } from '../ui';
import { FormPage, inputCls, Label } from './common';

function LocationMap({ center, onCenter }) {
  const el = useRef(null);
  const map = useRef(null);
  const [zoom, setZoom] = useState(20);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!MAPS_API_KEY) return undefined;
    let dead = false;
    importLibrary('maps')
      .then(({ Map }) => {
        if (dead || !el.current) return;
        const m = new Map(el.current, { center, zoom: 20, mapTypeId: 'satellite', tilt: 0, disableDefaultUI: true, gestureHandling: 'greedy', maxZoom: 21 });
        map.current = m;
        m.addListener('idle', () => {
          setZoom(m.getZoom());
          onCenter(m.getCenter().toJSON());
        });
      })
      .catch((e) => setErr(e.message));
    return () => (dead = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter()?.toJSON();
    if (!c || Math.abs(c.lat - center.lat) > 1e-7 || Math.abs(c.lng - center.lng) > 1e-7) m.setCenter(center);
  }, [center]);

  const btn = 'grid h-10 w-10 place-items-center rounded-lg bg-white text-slate-700 shadow-md hover:bg-slate-50';
  return (
    <div className="relative h-[420px] overflow-hidden rounded-2xl bg-slate-200">
      <div ref={el} className="absolute inset-0" />
      {!MAPS_API_KEY || err ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
          {err || 'Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local to see the satellite map. You can still continue with coordinates.'}
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <MapPin className="h-11 w-11 fill-red-500 text-red-700 drop-shadow" />
          </div>
          <div className="absolute left-4 top-4 space-y-1.5 text-xs">
            <div className="rounded-md bg-white px-2.5 py-1.5 font-semibold shadow">Satellite View</div>
            <div className="rounded-md bg-white/90 px-2.5 py-1.5 text-slate-500 shadow">Zoom: {zoom}</div>
          </div>
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-slate-900/80 px-3 py-1.5 text-xs text-white">Drag map to adjust</div>
          <div className="absolute bottom-8 right-4 flex flex-col gap-2">
            <button type="button" className={btn} onClick={() => el.current?.requestFullscreen?.()}>
              <Maximize className="h-4 w-4" />
            </button>
            <button type="button" className={btn} onClick={() => map.current?.setZoom(zoom + 1)}>
              <Plus className="h-4 w-4" />
            </button>
            <button type="button" className={btn} onClick={() => map.current?.setZoom(zoom - 1)}>
              <Minus className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function StepLocation({ design }) {
  const place = useStore((s) => s.place);
  const origin = useStore((s) => s.origin);
  const solar = useStore((s) => s.solar);
  const sections = useStore((s) => s.sections);
  const set = useStore((s) => s.set);
  const simple = useStore((s) => s.mode === 'simple');
  const [method, setMethod] = useState('search');
  const [coords, setCoords] = useState('');
  const [pending, setPending] = useState(place?.location || null);

  const confirmed = origin && pending && Math.abs(origin.lat - pending.lat) < 1e-7 && Math.abs(origin.lng - pending.lng) < 1e-7;
  const pick = (p) => {
    set({ place: p });
    setPending(p.location);
  };
  const confirm = () => {
    if (!pending) return;
    if (sections.length && !window.confirm('Changing the location clears the current roof design. Continue?')) return;
    set({ origin: pending, sections: [], objects: [], snapshot: null, ...(simple ? { step: 1, tool: 'select' } : {}) });
  };
  const applyCoords = () => {
    const m = coords.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) pick({ address: `${m[1]}, ${m[2]}`, location: { lat: Number(m[1]), lng: Number(m[2]) } });
  };
  const irradiance = design.yieldModel ? design.yieldModel.specificYield(0, 180) / 365 : 0;

  return (
    <FormPage icon={MapPin} title={simple ? 'Where is your home?' : 'Installation Location'}>
      {simple && <p className="-mt-2 text-slate-500">Type your address, move the map so the red pin sits on your roof, then press the green button.</p>}
      <div className={simple ? 'hidden' : ''}>
        <Label>Location Input Method</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={cx(inputCls, 'appearance-none pl-12')}>
            <option value="search">Search Address</option>
            <option value="coords">Enter Coordinates</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
      {method === 'search' ? (
        <div>
          <Label>Search Address</Label>
          <PlaceSearch onSelect={pick} />
        </div>
      ) : (
        <div>
          <Label>Latitude, Longitude</Label>
          <div className="flex gap-2">
            <input className={inputCls} placeholder="28.5450, 77.1926" value={coords} onChange={(e) => setCoords(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCoords()} />
            <button type="button" onClick={applyCoords} className="h-[52px] rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white">
              Go
            </button>
          </div>
        </div>
      )}

      {pending && (
        <>
          <LocationMap center={pending} onCenter={setPending} />
          <button type="button" onClick={confirm} disabled={confirmed} className={cx('flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[16px] font-semibold text-white', confirmed ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700')}>
            <CheckCircle2 className="h-5 w-5" /> {confirmed ? 'Location Confirmed' : simple ? 'Yes, this is my roof — continue' : 'Confirm Location'}
          </button>
        </>
      )}

      {origin && (
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <Sun className="mt-0.5 h-5 w-5 text-slate-600" />
          <div className="text-sm">
            <div className="font-semibold">Solar Data</div>
            <div className="text-slate-500">
              Irradiance: {irradiance.toFixed(2)} kWh/m²/day · {origin.lat.toFixed(5)}, {origin.lng.toFixed(5)}
            </div>
            <div className="mt-1 text-slate-500">
              {solar.status === 'loading' && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching Google Solar API building insights…
                </span>
              )}
              {solar.status === 'ok' && (
                <>
                  Google Solar API: {solar.data.imageryQuality} imagery · up to {solar.data.solarPotential?.maxArrayPanelsCount} panels · {Math.round(solar.data.solarPotential?.maxSunshineHoursPerYear || 0)} sun-hours/yr · roof{' '}
                  {Math.round(solar.data.solarPotential?.wholeRoofStats?.areaMeters2 || 0)} m²
                </>
              )}
              {solar.status === 'error' && <>Google Solar API: {solar.error} Using the built-in irradiance model.</>}
            </div>
          </div>
        </div>
      )}
    </FormPage>
  );
}

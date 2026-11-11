'use client';

import { CheckCircle2, Maximize, Minus, MousePointerClick, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { importLibrary, MAPS_API_KEY } from '@/lib/googleMaps';
import { areasMiddle, commitMarkedAreas, markedAreas } from '@/lib/solarModel';
import { useStore } from '@/lib/store';
import PlaceSearch from '../map/PlaceSearch';

/** The middle of a marked area (average of its corners: good enough for a roof). */
export const areaMiddle = (pts) => areasMiddle([pts]);

const round7 = (v) => Math.round(v * 1e7) / 1e7;
const ORANGE = '#f59e0b';

/**
 * The satellite map the roofs are marked on: every click adds a corner of the roof being drawn
 * (`points`); clicking its first corner again closes it (`onClose`). Finished roofs (`areas`) are
 * shown filled, one per building.
 */
function RoofMap({ center, areas, points, onAdd, onClose }) {
  const el = useRef(null);
  const map = useRef(null);
  const lib = useRef(null);
  const shapes = useRef([]);
  const handlers = useRef({ onAdd, onClose, points });
  const [zoom, setZoom] = useState(20);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    handlers.current = { onAdd, onClose, points };
  });

  useEffect(() => {
    if (!MAPS_API_KEY) return undefined;
    let dead = false;
    Promise.all([importLibrary('maps'), importLibrary('marker')])
      .then(() => {
        const maps = window.google.maps; // Map, Polygon, Polyline, Marker, SymbolPath
        if (dead || !el.current) return;
        const m = new maps.Map(el.current, {
          center,
          zoom: 20,
          mapTypeId: 'satellite',
          tilt: 0,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          maxZoom: 21,
          disableDoubleClickZoom: true, // quick clicks place corners, not zoom in
          draggableCursor: 'crosshair',
          clickableIcons: false,
        });
        map.current = m;
        lib.current = maps;
        m.addListener('idle', () => setZoom(m.getZoom()));
        // clicks are read straight from the page (the map itself drops a click that comes quickly
        // after another): a press and release without dragging the map is a corner; one near the
        // first corner closes the roof
        const view = new maps.OverlayView();
        view.onAdd = () => {};
        view.draw = () => {};
        view.onRemove = () => {};
        view.setMap(m);
        let down = null;
        const box = el.current;
        box.addEventListener('pointerdown', (e) => {
          down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
        });
        box.addEventListener('pointerup', (e) => {
          const start = down;
          down = null;
          const proj = view.getProjection();
          if (!start || !proj || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return; // the map was dragged
          const r = box.getBoundingClientRect();
          const px = new maps.Point(e.clientX - r.left, e.clientY - r.top);
          const { points: pts } = handlers.current;
          if (pts.length >= 3) {
            const first = proj.fromLatLngToContainerPixel(new maps.LatLng(pts[0]));
            if (first && Math.hypot(first.x - px.x, first.y - px.y) <= 16) {
              handlers.current.onClose();
              return;
            }
          }
          const ll = proj.fromContainerPixelToLatLng(px);
          if (ll) handlers.current.onAdd({ lat: round7(ll.lat()), lng: round7(ll.lng()) });
        });
        setReady(true);
      })
      .catch((e) => {
        console.error('Satellite map failed to load:', e);
        setErr(e.message || 'failed');
      });
    return () => {
      dead = true;
      shapes.current.forEach((s) => s.setMap(null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new address: the map goes there
  useEffect(() => {
    if (ready && map.current) map.current.setCenter(center);
  }, [center, ready]);

  // the finished roofs, and the outline being drawn
  useEffect(() => {
    const m = map.current;
    const maps = lib.current;
    if (!ready || !m || !maps) return;
    shapes.current.forEach((s) => s.setMap(null));
    shapes.current = [];
    areas.forEach((a, i) => {
      shapes.current.push(new maps.Polygon({ map: m, paths: a, clickable: false, strokeColor: ORANGE, strokeWeight: 3, fillColor: ORANGE, fillOpacity: 0.22 }));
      // its number, so the buildings can be told apart
      shapes.current.push(new maps.Marker({ map: m, position: areaMiddle(a), clickable: false, zIndex: 4, label: { text: String(i + 1), color: '#ffffff', fontWeight: '700', fontSize: '13px' }, icon: { path: maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#0f172a', fillOpacity: 0.85, strokeColor: ORANGE, strokeWeight: 2 } }));
    });
    if (points.length >= 2) {
      shapes.current.push(new maps.Polyline({ map: m, path: points, clickable: false, strokeColor: ORANGE, strokeWeight: 3 }));
    }
    points.forEach((p, i) => {
      // the first corner is bigger once the outline can be closed: clicking it finishes the roof
      const first = i === 0 && points.length >= 3;
      const dot = new maps.Marker({
        map: m,
        position: p,
        clickable: false,
        zIndex: first ? 10 : 5,
        title: first ? 'Click to finish the roof' : undefined,
        icon: { path: maps.SymbolPath.CIRCLE, scale: first ? 11 : 6, fillColor: first ? '#ffffff' : ORANGE, fillOpacity: 1, strokeColor: ORANGE, strokeWeight: first ? 4 : 2 },
      });
      shapes.current.push(dot);
    });
  }, [areas, points, ready]);

  const btn = 'grid h-11 w-11 place-items-center rounded-lg bg-white text-slate-700 shadow-md hover:bg-slate-50';
  return (
    <div className="absolute inset-0 bg-slate-200">
      <div ref={el} className="absolute inset-0" />
      {!MAPS_API_KEY || err ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-slate-500">
          {/* the technical reason goes to the console, not to the user */}
          The map could not load. Check your internet connection and reload the page; if it stays like this, contact support.
        </div>
      ) : (
        <div className="absolute bottom-6 right-4 flex flex-col gap-2">
          <button type="button" title="Full screen" className={btn} onClick={() => el.current?.parentElement?.requestFullscreen?.()}>
            <Maximize className="h-4 w-4" />
          </button>
          <button type="button" title="Zoom in" className={btn} onClick={() => map.current?.setZoom(zoom + 1)}>
            <Plus className="h-5 w-5" />
          </button>
          <button type="button" title="Zoom out" className={btn} onClick={() => map.current?.setZoom(zoom - 1)}>
            <Minus className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Step 1: find the address and mark every building's roof by clicking its corners on the satellite
 * map. Closing an outline (clicking its first corner, or Finish roof) keeps it and lets the next
 * building be marked; Continue saves the roofs and moves on to the solar plan.
 */
export default function StepLocation() {
  const place = useStore((s) => s.place);
  const origin = useStore((s) => s.origin);
  const set = useStore((s) => s.set);
  // the roofs already saved with the design are the starting point (read once: the list is edited here)
  const [areas, setAreas] = useState(() => markedAreas(useStore.getState())); // finished roofs, one per building
  // where the map looks: the marked roofs, else the searched address
  const [center, setCenter] = useState(() => (areas.length ? areasMiddle(areas) : origin || place?.location || null));
  const [points, setPoints] = useState([]); // the roof being drawn
  const drawing = points.length > 0;

  // the nav's Continue takes what was marked here along (see App.js): the finished roofs, and the
  // one still being drawn once it has three corners (the same as the Continue button on the map)
  useEffect(() => {
    const list = points.length >= 3 ? [...areas, points] : areas;
    set({ markedDraft: list.length ? list : null });
    return () => set({ markedDraft: null });
  }, [areas, points, set]);

  const pick = (p) => {
    // a new address starts the marking over: never without asking
    if ((areas.length || points.length) && !window.confirm('Going to a new address removes the roofs you marked here. Continue?')) return;
    set({ place: p });
    setCenter(p.location);
    setPoints([]);
    setAreas([]);
  };
  const add = (p) => setPoints((list) => [...list, p]);
  /** The roof being drawn is complete: keep it and get ready for the next building. */
  const closeRoof = () => {
    if (points.length < 3) return;
    setAreas((list) => [...list, points]);
    setPoints([]);
  };
  const proceed = () => {
    const list = points.length >= 3 ? [...areas, points] : areas;
    if (!list.length) return;
    if (!commitMarkedAreas(list)) return;
    useStore.getState().setStep(1);
  };
  const undo = () => {
    if (drawing) setPoints((list) => list.slice(0, -1));
    else setAreas((list) => list.slice(0, -1));
  };
  const restart = () => {
    setPoints([]);
    setAreas([]);
  };

  const n = areas.length;
  const hint = !center
    ? null
    : drawing
      ? points.length < 3
        ? 'Keep clicking the roof corners, one after another.'
        : 'Click the first corner (the big dot) or press Finish roof to close this roof.'
      : n === 0
        ? 'Zoom in on your house, then click each corner of the roof. For panels on the ground, click the corners of the land.'
        : `${n} roof${n > 1 ? 's' : ''} marked. Click the corners of another building to add it, or press Continue.`;

  return (
    <div className="absolute inset-0">
      {center ? (
        <RoofMap center={center} areas={areas} points={points} onAdd={add} onClose={closeRoof} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-slate-100 p-6 text-center">
          <div className="max-w-sm text-slate-500">
            <MousePointerClick className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            Search the customer&apos;s address above. Then click the corners of the roof on the satellite picture (or of the land, for panels on the ground).
          </div>
        </div>
      )}

      {/* the address search, over the map */}
      <div className="absolute left-4 right-4 top-4 z-10 sm:right-auto sm:w-[420px]">
        <PlaceSearch onSelect={pick} />
      </div>

      {hint && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 sm:top-4 sm:ml-[220px] sm:w-[min(480px,calc(100%-480px))]">
          <div className="rounded-lg bg-slate-900/85 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">{hint}</div>
        </div>
      )}

      {center && (drawing || n > 0) && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-wrap justify-center gap-2">
          <button type="button" onClick={undo} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-700 shadow-md hover:bg-slate-50">
            <Undo2 className="h-4 w-4" /> {drawing ? 'Undo last corner' : 'Remove last roof'}
          </button>
          <button type="button" onClick={restart} className="inline-flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-700 shadow-md hover:bg-slate-50">
            <RotateCcw className="h-4 w-4" /> Start again
          </button>
          {drawing && points.length >= 3 && (
            <button type="button" onClick={closeRoof} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-fg shadow-md hover:bg-brand-600">
              <CheckCircle2 className="h-4 w-4" /> Finish roof
            </button>
          )}
          {(n > 0 || points.length >= 3) && (
            <button type="button" onClick={proceed} className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-md ${drawing ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-brand text-brand-fg hover:bg-brand-600'}`}>
              <CheckCircle2 className="h-4 w-4" /> Continue to Building{n > 1 ? ` (${n} buildings)` : ''}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

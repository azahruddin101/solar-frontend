'use client';

import { AlertTriangle, Crosshair, KeyRound, Layers, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { finishPolygon, loadSampleProject, SEGMENT_COLORS, undoPoint } from '@/lib/actions';
import { distanceMeters, latLngCentroid } from '@/lib/geo';
import { importLibrary, MAPS_API_KEY, onMapsAuthFailure } from '@/lib/googleMaps';
import { useStore } from '@/lib/store';
import { Button, Kbd } from '../ui';

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

const PIN_SVG = `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 43s15-14.1 15-26A15 15 0 0 0 2 17c0 11.9 15 26 15 26z" fill="#f59e0b" stroke="#0f172a" stroke-width="2"/><circle cx="17" cy="17" r="5.5" fill="#0f172a"/></svg>`;

/** OverlayView that renders absolutely-positioned HTML items at lat/lngs. */
function createHtmlLayer(google, map, { minZoom = 0 } = {}) {
  class HtmlLayer extends google.maps.OverlayView {
    constructor() {
      super();
      this.items = [];
      this.root = null;
    }
    onAdd() {
      this.root = document.createElement('div');
      this.root.style.position = 'absolute';
      this.getPanes().floatPane.appendChild(this.root);
      this.renderItems();
    }
    onRemove() {
      this.root?.remove();
      this.root = null;
    }
    setItems(items) {
      this.items = items;
      this.renderItems();
    }
    renderItems() {
      if (!this.root) return;
      this.root.replaceChildren(
        ...this.items.map((it) => {
          const el = document.createElement('div');
          el.className = it.className || 'map-label';
          if (it.html) el.innerHTML = it.html;
          else el.textContent = it.text;
          el.dataset.lat = it.position.lat;
          el.dataset.lng = it.position.lng;
          return el;
        }),
      );
      this.draw();
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.root) return;
      this.root.style.display = (map.getZoom() ?? 0) < minZoom ? 'none' : 'block';
      for (const el of this.root.children) {
        const p = proj.fromLatLngToDivPixel(new google.maps.LatLng(Number(el.dataset.lat), Number(el.dataset.lng)));
        if (!p) continue;
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
      }
    }
  }
  const layer = new HtmlLayer();
  layer.setMap(map);
  return layer;
}

const samePath = (mvc, pts) => {
  if (mvc.getLength() !== pts.length) return false;
  for (let i = 0; i < pts.length; i++) {
    const ll = mvc.getAt(i);
    if (Math.abs(ll.lat() - pts[i].lat) > 1e-10 || Math.abs(ll.lng() - pts[i].lng) > 1e-10) return false;
  }
  return true;
};

const fmtLen = (m) => (m >= 100 ? `${m.toFixed(0)} m` : `${m.toFixed(1)} m`);

export default function MapView({ design }) {
  const containerRef = useRef(null);
  const ctx = useRef(null);
  const [status, setStatus] = useState(MAPS_API_KEY ? 'loading' : 'nokey');
  const [error, setError] = useState('');
  const [showLabels, setShowLabels] = useState(false);

  const step = useStore((s) => s.step);
  const place = useStore((s) => s.place);
  const polygon = useStore((s) => s.polygon);
  const closed = useStore((s) => s.closed);
  const solarData = useStore((s) => s.solar.data);
  const showSegments = useStore((s) => s.showSegments);

  // ---- create map + overlays once ----
  useEffect(() => {
    if (!MAPS_API_KEY) return undefined;
    let cancelled = false;
    const offAuth = onMapsAuthFailure(() => {
      setStatus('error');
      setError('Google Maps rejected the API key. Make sure the Maps JavaScript API is enabled and the key allows this website (HTTP referrer).');
    });

    (async () => {
      try {
        const { Map, Polyline, Polygon } = await importLibrary('maps');
        if (cancelled || !containerRef.current) return;
        const g = window.google;
        const s = useStore.getState();
        const start = s.origin || s.place?.location;
        const map = new Map(containerRef.current, {
          center: start || DEFAULT_CENTER,
          zoom: start ? 20 : 5,
          mapTypeId: s.step === 1 ? 'satellite' : 'hybrid',
          tilt: 0,
          heading: 0,
          disableDefaultUI: true,
          zoomControl: true,
          scaleControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          maxZoom: 21,
        });

        const linePath = new g.maps.MVCArray();
        const polyPath = new g.maps.MVCArray();
        const drawLine = new Polyline({ map, path: linePath, strokeColor: '#f59e0b', strokeWeight: 3, editable: true, zIndex: 20 });
        const rubber = new Polyline({
          map,
          clickable: false,
          strokeOpacity: 0,
          zIndex: 19,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#fde68a', scale: 2.5 }, offset: '0', repeat: '10px' }],
        });
        const poly = new Polygon({
          map,
          paths: new g.maps.MVCArray([polyPath]),
          strokeColor: '#f59e0b',
          strokeWeight: 3,
          fillColor: '#f59e0b',
          fillOpacity: 0.2,
          zIndex: 20,
        });
        const labels = createHtmlLayer(g, map, { minZoom: 18 });
        const pin = createHtmlLayer(g, map);

        const state = { map, g, drawLine, rubber, poly, linePath, polyPath, labels, pin, segments: [], applying: false, placeKey: null };
        ctx.current = state;

        const pathToArray = (mvc) => mvc.getArray().map((ll) => ll.toJSON());
        const syncFrom = (mvc) => () => {
          if (state.applying) return;
          useStore.getState().setPolygon(pathToArray(mvc));
        };
        for (const ev of ['set_at', 'insert_at', 'remove_at']) {
          linePath.addListener(ev, syncFrom(linePath));
          polyPath.addListener(ev, syncFrom(polyPath));
        }

        map.addListener('click', (e) => {
          const st = useStore.getState();
          if (st.step !== 1 || st.closed || !e.latLng) return;
          st.setPolygon([...st.polygon, e.latLng.toJSON()]);
        });
        map.addListener('mousemove', (e) => {
          const st = useStore.getState();
          if (st.step !== 1 || st.closed || !st.polygon.length) return;
          const pts = [st.polygon[st.polygon.length - 1], e.latLng.toJSON()];
          if (st.polygon.length >= 2) pts.push(st.polygon[0]);
          rubber.setPath(pts);
        });
        map.addListener('mouseout', () => rubber.setPath([]));

        drawLine.addListener('click', (e) => {
          const st = useStore.getState();
          if (st.step !== 1 || st.closed) return;
          const n = st.polygon.length;
          if ((e.vertex === 0 || e.vertex === n - 1) && n >= 3) {
            finishPolygon();
          } else if (e.vertex == null && e.latLng) {
            st.setPolygon([...st.polygon, e.latLng.toJSON()]);
          }
        });
        const removeVertex = (min) => (e) => {
          const st = useStore.getState();
          if (st.step !== 1 || e.vertex == null || st.polygon.length <= min) return;
          st.setPolygon(st.polygon.filter((_, i) => i !== e.vertex));
        };
        drawLine.addListener('contextmenu', removeVertex(0));
        poly.addListener('contextmenu', removeVertex(3));

        if (s.closed && s.polygon.length >= 3) {
          const b = new g.maps.LatLngBounds();
          s.polygon.forEach((p) => b.extend(p));
          map.fitBounds(b, 80);
        }
        state.placeKey = s.place ? `${s.place.location.lat},${s.place.location.lng}` : null;
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e.message || String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      offAuth();
    };
  }, []);

  // ---- store -> overlays ----
  useEffect(() => {
    const c = ctx.current;
    if (status !== 'ready' || !c) return;
    const drawing = step === 1 && !closed;
    const write = (mvc, pts) => {
      if (samePath(mvc, pts)) return;
      c.applying = true;
      mvc.clear();
      pts.forEach((p) => mvc.push(new c.g.maps.LatLng(p)));
      c.applying = false;
    };
    write(c.linePath, drawing ? polygon : []);
    write(c.polyPath, closed ? polygon : []);
    c.drawLine.setOptions({ visible: drawing, editable: drawing });
    c.poly.setOptions({ visible: closed, editable: step === 1 && closed, fillOpacity: step === 1 ? 0.2 : 0.3 });
    if (!drawing) c.rubber.setPath([]);
    c.map.setOptions({ draggableCursor: drawing ? 'crosshair' : null, disableDoubleClickZoom: drawing });

    const items = [];
    if (step === 1 && polygon.length >= 2) {
      const n = polygon.length;
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % n];
        items.push({ position: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }, text: fmtLen(distanceMeters(a, b)) });
      }
      if (closed && design?.shape?.area) {
        items.push({ position: latLngCentroid(polygon), text: `${design.shape.area.toFixed(1)} m²`, className: 'map-label area' });
      }
    }
    c.labels.setItems(items);
  }, [status, step, polygon, closed, design?.shape?.area]);

  // ---- place pin + recentre when a new place is picked ----
  useEffect(() => {
    const c = ctx.current;
    if (status !== 'ready' || !c) return;
    c.pin.setItems(place && !closed ? [{ position: place.location, html: PIN_SVG, className: 'map-pin' }] : []);
    const key = place ? `${place.location.lat},${place.location.lng}` : null;
    if (!place || key === c.placeKey) return;
    c.placeKey = key;
    const vp = place.viewport;
    const bigArea = vp && distanceMeters({ lat: vp.south, lng: vp.west }, { lat: vp.north, lng: vp.east }) > 600;
    if (bigArea) c.map.fitBounds(vp);
    else {
      c.map.setCenter(place.location);
      c.map.setZoom(20);
    }
  }, [status, place, closed]);

  // ---- basemap per step ----
  useEffect(() => {
    const c = ctx.current;
    if (status !== 'ready' || !c) return;
    c.map.setMapTypeId(step === 0 || showLabels ? 'hybrid' : 'satellite');
  }, [status, step, showLabels]);

  // ---- Solar API roof segments ----
  useEffect(() => {
    const c = ctx.current;
    if (status !== 'ready' || !c) return;
    c.segments.forEach((r) => r.setMap(null));
    c.segments = [];
    const segs = solarData?.solarPotential?.roofSegmentStats;
    if (!segs || !showSegments || step !== 1) return;
    c.segments = segs
      .filter((sg) => sg.boundingBox?.sw && sg.boundingBox?.ne)
      .map(
        (sg, i) =>
          new c.g.maps.Rectangle({
            map: c.map,
            clickable: false,
            zIndex: 1,
            bounds: {
              south: sg.boundingBox.sw.latitude,
              west: sg.boundingBox.sw.longitude,
              north: sg.boundingBox.ne.latitude,
              east: sg.boundingBox.ne.longitude,
            },
            strokeColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            strokeWeight: 1.5,
            strokeOpacity: 0.9,
            fillColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
            fillOpacity: 0.12,
          }),
      );
  }, [status, solarData, showSegments, step]);

  // ---- keyboard shortcuts while outlining ----
  useEffect(() => {
    if (step !== 1) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (st.closed) return;
      if (e.key === 'Enter') finishPolygon();
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        undoPoint();
      } else if (e.key === 'Escape') st.setPolygon([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const recenter = () => {
    const c = ctx.current;
    if (!c) return;
    if (polygon.length >= 2) {
      const b = new c.g.maps.LatLngBounds();
      polygon.forEach((p) => b.extend(p));
      c.map.fitBounds(b, 80);
    } else if (place) {
      c.map.setCenter(place.location);
      c.map.setZoom(20);
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-800">
      <div ref={containerRef} className="absolute inset-0" />

      {status === 'ready' && step === 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <div className="rounded-full bg-slate-900/85 px-4 py-2 text-xs text-white shadow-lg backdrop-blur">
            {!closed ? (
              polygon.length === 0 ? (
                <>Click on the roof corners to outline your building</>
              ) : (
                <>
                  {polygon.length} point{polygon.length === 1 ? '' : 's'} · click the first point or press <Kbd>Enter</Kbd> to finish ·{' '}
                  <Kbd>⌫</Kbd> undo
                </>
              )
            ) : (
              <>Drag corners to adjust · drag a mid-point to add a corner · right-click a corner to delete it</>
            )}
          </div>
        </div>
      )}

      {status === 'ready' && step === 0 && !place && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
          <div className="rounded-full bg-slate-900/85 px-4 py-2 text-xs text-white shadow-lg">Search for an address to fly to the building</div>
        </div>
      )}

      {status === 'ready' && (
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          {step === 1 && (
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              title="Toggle street labels"
              className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-700 shadow-md hover:bg-slate-50"
            >
              <Layers className="h-4 w-4" />
            </button>
          )}
          {(place || polygon.length > 0) && (
            <button
              type="button"
              onClick={recenter}
              title="Recentre on building"
              className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-700 shadow-md hover:bg-slate-50"
            >
              <Crosshair className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading Google Maps…
          </div>
        </div>
      )}

      {(status === 'nokey' || status === 'error') && (
        <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-slate-900 p-6">
          <div className="max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
              {status === 'nokey' ? <KeyRound className="h-5 w-5 text-amber-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              {status === 'nokey' ? 'Add your Google Maps API key' : 'Google Maps could not load'}
            </div>
            {status === 'error' && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
              <li>
                In Google Cloud, enable <b>Maps JavaScript API</b>, <b>Places API (New)</b>, <b>Geocoding API</b>, <b>Solar API</b> and{' '}
                <b>Maps Static API</b>.
              </li>
              <li>
                Create <code className="rounded bg-slate-100 px-1">.env.local</code> in the project root:
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-key\nGOOGLE_MAPS_API_KEY=your-server-key'}
                </pre>
              </li>
              <li>Restart the dev server.</li>
            </ol>
            <div className="mt-5 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-sm text-amber-900">Want to look around first? Open the 3D designer with a sample footprint.</p>
              <Button variant="primary" className="mt-3" icon={Sparkles} onClick={loadSampleProject}>
                Try the sample building
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

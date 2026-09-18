'use client';

// Full-bleed 2D editor drawn in SVG over satellite imagery (local metres, north up).

import { useEffect, useMemo, useRef, useState } from 'react';
import { DEG } from '@/lib/geo';
import { dist, polygonCentroid, rectPoly } from '@/lib/geometry';
import { magnetize, newId, PANEL_GAP, tableSize } from '@/lib/model';
import { staticMapSize, staticMapUrl } from '@/lib/staticMap';
import { useStore } from '@/lib/store';

const BLUE = '#2f5bea';
const ORANGE = '#f5a524';

function snapPoint(raw, pts, scale) {
  const tol = 12 / scale;
  if (pts.length >= 3 && dist(raw, pts[0]) < tol) return { p: pts[0], close: true, guides: [] };
  let p = raw;
  const guides = [];
  if (pts.length >= 2) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const base = Math.atan2(b.y - a.y, b.x - a.x);
    const ang = Math.atan2(raw.y - b.y, raw.x - b.x);
    const len = dist(raw, b);
    const rel = ((ang - base) / (Math.PI / 2));
    const near = Math.round(rel);
    if (Math.abs(rel - near) < 0.09) {
      const s = base + (near * Math.PI) / 2;
      const l = len * Math.cos(ang - s);
      p = { x: b.x + Math.cos(s) * l, y: b.y + Math.sin(s) * l };
      guides.push({ a: b, dir: s, square: near % 2 !== 0 ? b : null, prev: a });
      // also align with the first point along the edge axes
      const f = pts[0];
      for (const axis of [base, base + Math.PI / 2]) {
        const nx = -Math.sin(axis);
        const ny = Math.cos(axis);
        const d = (p.x - f.x) * nx + (p.y - f.y) * ny;
        const along = Math.abs(Math.cos(s - axis));
        if (Math.abs(d) < tol && along > 0.9) {
          p = { x: p.x - nx * d, y: p.y - ny * d };
          guides.push({ a: f, dir: axis });
        }
      }
    }
  }
  return { p, close: false, guides };
}

function EdgeLabel({ a, b, toS, color = '#111827' }) {
  const l = dist(a, b);
  if (l < 0.4) return null;
  const A = toS(a);
  const B = toS(b);
  if (Math.hypot(B.x - A.x, B.y - A.y) < 46) return null;
  let deg = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const text = `${l.toFixed(2)} m`;
  return (
    <g transform={`translate(${mx} ${my}) rotate(${deg})`} pointerEvents="none">
      <rect x={-text.length * 3.6 - 5} y={-10} width={text.length * 7.2 + 10} height={20} rx={4} fill={color} opacity="0.88" />
      <text textAnchor="middle" y={4} fontSize="12" fontWeight="600" fill="#fff">
        {text}
      </text>
    </g>
  );
}

export default function Editor2D({ design, showPanels = true, showObjects = true, editSections = false, stringColors = null, children }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [view, setView] = useState({ cx: 0, cy: 0, scale: 14 });
  const [draft, setDraft] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [area, setArea] = useState(null); // rectangle being dragged with the mark-area tool
  const drag = useRef(null);
  const fitted = useRef(false);

  const origin = useStore((s) => s.origin);
  const tool = useStore((s) => s.tool);
  const selectedId = useStore((s) => s.selectedId);
  const sections = useStore((s) => s.sections);
  const objects = useStore((s) => s.objects);
  const config = useStore((s) => s.config);
  const st = useStore.getState;

  useEffect(() => {
    const el = ref.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit to roof once
  useEffect(() => {
    if (fitted.current || size.w < 50) return;
    fitted.current = true;
    const pts = sections.flatMap((s) => s.points);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs) || 20;
    const h = Math.max(...ys) - Math.min(...ys) || 20;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView({ cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, scale: Math.min(size.w / (w * 1.9), size.h / (h * 1.7)) });
  }, [size, sections]);

  const toS = (p) => ({ x: (p.x - view.cx) * view.scale + size.w / 2, y: (view.cy - p.y) * view.scale + size.h / 2 });
  const toW = (sx, sy) => ({ x: (sx - size.w / 2) / view.scale + view.cx, y: view.cy - (sy - size.h / 2) / view.scale });
  const evW = (e) => {
    const r = ref.current.getBoundingClientRect();
    return toW(e.clientX - r.left, e.clientY - r.top);
  };
  const pts = (poly) => poly.map((p) => toS(p)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const images = useMemo(() => {
    if (!origin) return [];
    return [18, 20].map((zoom) => ({ zoom, size: staticMapSize(origin.lat, zoom), url: staticMapUrl({ lat: origin.lat, lng: origin.lng, zoom }) }));
  }, [origin]);

  const areaRect = (a, b) => {
    const az = design.defaultAzimuth;
    const f = { x: Math.sin(az * DEG), y: Math.cos(az * DEG) };
    const c = { x: f.y, y: -f.x };
    const du = (b.x - a.x) * c.x + (b.y - a.y) * c.y;
    const dv = (b.x - a.x) * f.x + (b.y - a.y) * f.y;
    const center = { x: a.x + (c.x * du + f.x * dv) / 2, y: a.y + (c.y * du + f.y * dv) / 2 };
    return { center, w: Math.abs(du), d: Math.abs(dv), az, poly: rectPoly(center.x, center.y, Math.abs(du), Math.abs(dv), az) };
  };

  const drawing = tool === 'draw-section' || tool === 'draw-zone';
  const snap = drawing && cursor ? snapPoint(cursor, draft, view.scale) : null;

  const finishDraft = (points) => {
    if (points.length < 3) return;
    const s = st();
    if (tool === 'draw-section') {
      const first = s.sections.length === 0;
      s.addSection({ id: newId('r'), name: first ? 'Main roof' : `Elevated roof ${s.sections.length}`, points, height: first ? 6 : (s.sections[0]?.height || 6) + 3, parapetH: first ? 1 : 0.6, parapetT: 0.23 });
    } else {
      s.addObject({ id: newId('z'), type: 'zone', points, tilt: config.tilt, azimuth: design.defaultAzimuth, frontLeg: config.frontLeg, rowsPerTable: config.rowsPerTable, orientation: config.orientation, rowGap: config.rowGap });
    }
    setDraft([]);
  };

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const s = st();
      if (drawing) {
        if (e.key === 'Enter') finishDraft(draft);
        else if (e.key === 'Backspace') setDraft((d) => d.slice(0, -1));
        else if (e.key === 'Escape') {
          setDraft([]);
          s.set({ tool: 'select' });
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) s.remove(s.selectedId);
      else if (e.key === 'Escape') s.set({ selectedId: null, tool: 'select' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onWheel = (e) => {
    const r = ref.current.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const before = toW(sx, sy);
    const scale = Math.min(120, Math.max(1.5, view.scale * Math.exp(-e.deltaY * 0.0015)));
    setView({ scale, cx: before.x - (sx - size.w / 2) / scale, cy: before.y + (sy - size.h / 2) / scale });
  };

  const onDown = (e) => {
    if (e.button !== 0) return;
    const w = evW(e);
    const s = st();
    if (drawing) {
      // a click adds a corner, a drag pans the picture
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view, click: w };
      ref.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'mark-area') {
      drag.current = { kind: 'area', start: w };
      ref.current.setPointerCapture(e.pointerId);
      return;
    }
    if (tool === 'add-tree') return s.addObject({ id: newId('t'), type: 'tree', x: w.x, y: w.y, r: 2.5, h: 8 });
    if (tool === 'add-block') return s.addObject({ id: newId('b'), type: 'block', name: 'Water tank', w: 2, d: 2, h: 1.8, ...(s.pendingBlock || {}), x: w.x, y: w.y, rot: design.defaultAzimuth });
    if (tool === 'add-array' || tool === 'add-elevated') {
      const elevated = tool === 'add-elevated';
      return s.addObject({ id: newId('a'), type: 'array', elevated, x: w.x, y: w.y, rows: elevated ? 3 : 2, cols: 4, tilt: elevated ? 10 : config.tilt, azimuth: design.defaultAzimuth, frontLeg: elevated ? 2.4 : config.frontLeg, orientation: config.orientation });
    }
    // pan
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view };
    s.set({ selectedId: null });
    ref.current.setPointerCapture(e.pointerId);
  };

  const startDrag = (e, d) => {
    if (drawing || tool.startsWith('add') || tool === 'mark-area') return;
    e.stopPropagation();
    if (e.button !== 0) return;
    st().set({ selectedId: d.id });
    drag.current = { ...d, start: evW(e) };
    ref.current.setPointerCapture(e.pointerId);
  };

  const onMove = (e) => {
    const w = evW(e);
    if (drawing) setCursor(w);
    const d = drag.current;
    if (!d) return;
    const s = st();
    if (d.kind === 'area') return setArea({ ...areaRect(d.start, w), start: d.start, end: w });
    if (d.kind === 'pan') {
      if (d.click && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.click = null;
      setView({ ...d.view, cx: d.view.cx - (e.clientX - d.sx) / view.scale, cy: d.view.cy + (e.clientY - d.sy) / view.scale });
    } else if (d.kind === 'move') {
      const dx = w.x - d.start.x;
      const dy = w.y - d.start.y;
      if (d.points) (d.isSection ? s.updateSection : s.updateObject)(d.id, { points: d.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) });
      else {
        const o = s.objects.find((k) => k.id === d.id);
        const pos = { x: d.x + dx, y: d.y + dy };
        s.updateObject(d.id, o?.type === 'array' && !e.altKey ? magnetize(o, pos, design) : pos);
      }
    } else if (d.kind === 'vertex') {
      const points = d.points.map((p, i) => (i === d.index ? w : p));
      (d.isSection ? s.updateSection : s.updateObject)(d.id, { points });
    } else if (d.kind === 'resize-table') {
      const o = s.objects.find((k) => k.id === d.id);
      if (!o) return;
      const f = { x: Math.sin(o.azimuth * DEG), y: Math.cos(o.azimuth * DEG) };
      const c = { x: f.y, y: -f.x };
      const one = tableSize({ ...o, rows: 1, cols: 1 }, design.spec);
      const uExt = (w.x - d.anchor.x) * c.x + (w.y - d.anchor.y) * c.y;
      const vExt = -((w.x - d.anchor.x) * f.x + (w.y - d.anchor.y) * f.y);
      const cols = Math.max(1, Math.min(40, Math.round((uExt + PANEL_GAP) / (one.width + PANEL_GAP))));
      const rows = Math.max(1, Math.min(8, Math.round((vExt + PANEL_GAP) / (one.depth + PANEL_GAP))));
      const size = tableSize({ ...o, rows, cols }, design.spec);
      s.updateObject(o.id, { rows, cols, x: d.anchor.x + c.x * (size.width / 2) - f.x * (size.depth / 2), y: d.anchor.y + c.y * (size.width / 2) - f.y * (size.depth / 2) });
    } else if (d.kind === 'resize-block') {
      const o = s.objects.find((k) => k.id === d.id);
      if (!o) return;
      const a = ((o.rot || 0) * Math.PI) / 180;
      const lu = (w.x - o.x) * Math.cos(a) - (w.y - o.y) * Math.sin(a);
      const lv = (w.x - o.x) * Math.sin(a) + (w.y - o.y) * Math.cos(a);
      s.updateObject(o.id, { w: Math.max(0.4, Math.round(Math.abs(lu) * 20) / 10), d: Math.max(0.4, Math.round(Math.abs(lv) * 20) / 10) });
    } else if (d.kind === 'radius') s.updateObject(d.id, { r: Math.max(0.5, dist(w, d.center)) });
    else if (d.kind === 'rotate') {
      let az = (Math.atan2(w.x - d.center.x, w.y - d.center.y) / DEG + 360) % 360;
      if (e.shiftKey) az = Math.round(az / 15) * 15;
      s.updateObject(d.id, d.isBlock ? { rot: az } : { azimuth: Math.round(az) });
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'area') {
      const s = st();
      const kind = s.pendingKey;
      const preset = s.pendingBlock || {};
      const r = area && (area.w > 0.5 || area.d > 0.5) ? area : null;
      const main = s.sections[0];
      setArea(null);
      if (kind === 'tree') {
        const rad = r ? Math.max(1, Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y) / 2) : 2.5;
        const c = r ? { x: (r.start.x + r.end.x) / 2, y: (r.start.y + r.end.y) / 2 } : d.start;
        s.addObject({ id: newId('t'), type: 'tree', x: c.x, y: c.y, r: rad, h: Math.max(5, rad * 3) });
      } else if (kind === 'floor') {
        const q = r || areaRect({ x: d.start.x - 2, y: d.start.y - 2 }, { x: d.start.x + 2, y: d.start.y + 2 });
        s.addSection({ id: newId('r'), name: 'Roof on roof', points: rectPoly(q.center.x, q.center.y, Math.max(q.w, 1), Math.max(q.d, 1), q.az), height: (main?.height || 3) + 2.7, parapetH: 0.3, parapetT: 0.2 });
      } else {
        const c = r ? r.center : d.start;
        s.addObject({ id: newId('b'), type: 'block', name: 'Object', h: 1.8, ...preset, x: c.x, y: c.y, w: r ? Math.max(r.w, 0.4) : preset.w || 1.5, d: r ? Math.max(r.d, 0.4) : preset.d || 1.5, rot: design.defaultAzimuth });
      }
      s.set({ pendingKey: null, pendingBlock: null });
      return;
    }
    if (d?.click && drawing) {
      const sn = snapPoint(d.click, draft, view.scale);
      if (sn.close) finishDraft(draft);
      else setDraft([...draft, sn.p]);
    }
  };

  const vertexHandles = (id, points, isSection) =>
    points.map((p, i) => {
      const q = toS(p);
      return (
        <circle
          key={i}
          cx={q.x}
          cy={q.y}
          r={7}
          fill="#fff"
          stroke={isSection ? BLUE : '#1d4ed8'}
          strokeWidth={3}
          style={{ cursor: 'move' }}
          onPointerDown={(e) => startDrag(e, { kind: 'vertex', id, index: i, points, isSection })}
          onContextMenu={(e) => {
            e.preventDefault();
            if (points.length > 3) (isSection ? st().updateSection : st().updateObject)(id, { points: points.filter((_, j) => j !== i) });
          }}
        />
      );
    });

  const cursorStyle = drawing || tool.startsWith('add') || tool === 'mark-area' ? 'crosshair' : 'grab';

  return (
    <div ref={ref} className="absolute inset-0 touch-none select-none overflow-hidden bg-[#0b1020]" style={{ cursor: cursorStyle }} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
      <svg width={size.w} height={size.h} className="block">
        {images.map((im) => {
          const tl = toS({ x: -im.size / 2, y: im.size / 2 });
          return <image key={im.zoom} href={im.url} x={tl.x} y={tl.y} width={im.size * view.scale} height={im.size * view.scale} preserveAspectRatio="none" />;
        })}

        {/* roof sections */}
        {sections.map((s) => {
          const sel = s.id === selectedId && editSections;
          return (
            <g key={s.id}>
              <polygon
                points={pts(s.points)}
                fill={editSections ? 'rgba(180,195,255,0.35)' : 'rgba(180,195,255,0.12)'}
                stroke={BLUE}
                strokeWidth={editSections ? 3 : 2}
                strokeLinejoin="round"
                onPointerDown={editSections ? (e) => startDrag(e, { kind: 'move', id: s.id, points: s.points, isSection: true }) : undefined}
              />
              {editSections && s.points.map((p, i) => <EdgeLabel key={i} a={p} b={s.points[(i + 1) % s.points.length]} toS={toS} />)}
              {sel && vertexHandles(s.id, s.points, true)}
              {editSections && !sel && s.points.map((p, i) => <circle key={i} cx={toS(p).x} cy={toS(p).y} r={5} fill="#fff" stroke={BLUE} strokeWidth={2} pointerEvents="none" />)}
            </g>
          );
        })}

        {/* zones */}
        {showPanels &&
          objects
            .filter((o) => o.type === 'zone')
            .map((z) => {
              const sel = z.id === selectedId;
              return (
                <g key={z.id}>
                  <polygon points={pts(z.points)} fill={sel ? 'rgba(59,91,234,0.22)' : 'rgba(59,91,234,0.08)'} stroke="#3b5bea" strokeWidth={sel ? 2 : 1} strokeDasharray={sel ? '' : '6 4'} onPointerDown={(e) => startDrag(e, { kind: 'move', id: z.id, points: z.points })} />
                  {sel && vertexHandles(z.id, z.points, false)}
                </g>
              );
            })}

        {/* obstructions */}
        {showObjects &&
          objects
            .filter((o) => o.type === 'block')
            .map((b) => {
              const sel = b.id === selectedId;
              const poly = rectPoly(b.x, b.y, b.w, b.d, b.rot || 0);
              const c = toS(b);
              return (
                <g key={b.id}>
                  <polygon points={pts(poly)} fill="rgba(239,68,68,0.35)" stroke="#ef4444" strokeWidth={sel ? 3 : 1.5} onPointerDown={(e) => startDrag(e, { kind: 'move', id: b.id, x: b.x, y: b.y })} />
                  <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#7f1d1d', strokeWidth: 3 }}>
                    {b.name}
                  </text>
                  {sel && <circle cx={toS(poly[2]).x} cy={toS(poly[2]).y} r={8} fill="#fff" stroke="#ef4444" strokeWidth={3} style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => startDrag(e, { kind: 'resize-block', id: b.id })} />}
                </g>
              );
            })}
        {showObjects &&
          objects
            .filter((o) => o.type === 'tree')
            .map((t) => {
              const c = toS(t);
              const sel = t.id === selectedId;
              return (
                <g key={t.id}>
                  <circle cx={c.x} cy={c.y} r={t.r * view.scale} fill="rgba(74,180,90,0.55)" stroke="#2f9e44" strokeWidth={sel ? 3 : 1.5} strokeDasharray="7 4" onPointerDown={(e) => startDrag(e, { kind: 'move', id: t.id, x: t.x, y: t.y })} />
                  {sel && <circle cx={c.x + t.r * view.scale} cy={c.y} r={6} fill="#fff" stroke="#2f9e44" strokeWidth={3} style={{ cursor: 'ew-resize' }} onPointerDown={(e) => startDrag(e, { kind: 'radius', id: t.id, center: { x: t.x, y: t.y } })} />}
                </g>
              );
            })}

        {/* panel tables */}
        {showPanels &&
          design.tables.map((t) => {
            const manual = t.kind !== 'zone';
            const sel = t.source === selectedId && manual;
            const elevated = t.kind === 'elevated';
            const front = [t.poly[2], t.poly[3]];
            const mid = toS({ x: (front[0].x + front[1].x) / 2, y: (front[0].y + front[1].y) / 2 });
            const handle = toS({ x: t.x + Math.sin(t.azimuth * DEG) * (t.size.depth / 2 + 1.2), y: t.y + Math.cos(t.azimuth * DEG) * (t.size.depth / 2 + 1.2) });
            return (
              <g key={t.id} onPointerDown={manual ? (e) => startDrag(e, { kind: 'move', id: t.source, x: t.x, y: t.y }) : (e) => startDrag(e, { kind: 'none', id: t.source })} style={{ cursor: manual ? 'move' : 'pointer' }}>
                {elevated && <polygon points={pts(rectPoly(t.x, t.y, t.size.width + 0.5, t.size.depth + 0.5, t.azimuth))} fill="rgba(245,165,36,0.45)" stroke={ORANGE} strokeWidth={2} />}
                {t.modules.map((m) => {
                  const si = stringColors?.get(m.id);
                  return <polygon key={m.id} points={pts(m.corners)} fill={!t.valid ? 'rgba(239,68,68,0.7)' : si != null ? si : 'rgba(40,98,235,0.85)'} stroke={elevated || sel ? ORANGE : '#dbe6ff'} strokeWidth={0.8} />;
                })}
                {sel && (
                  <>
                    <polygon points={pts(t.poly)} fill="none" stroke={ORANGE} strokeWidth={2.5} />
                    <line x1={mid.x} y1={mid.y} x2={handle.x} y2={handle.y} stroke={ORANGE} strokeWidth={2} />
                    <g style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => startDrag(e, { kind: 'resize-table', id: t.source, anchor: t.poly[3] })}>
                      <circle cx={toS(t.poly[1]).x} cy={toS(t.poly[1]).y} r={11} fill="#fff" stroke={ORANGE} strokeWidth={3} />
                      <text x={toS(t.poly[1]).x} y={toS(t.poly[1]).y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={ORANGE} pointerEvents="none">⤡</text>
                    </g>
                    <circle cx={handle.x} cy={handle.y} r={7} fill={ORANGE} stroke="#fff" strokeWidth={2} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, { kind: 'rotate', id: t.source, center: { x: t.x, y: t.y } })} />
                  </>
                )}
              </g>
            );
          })}

        {area && (
          <g pointerEvents="none">
            {st().pendingKey === 'tree' ? (
              <circle cx={toS({ x: (area.start.x + area.end.x) / 2, y: (area.start.y + area.end.y) / 2 }).x} cy={toS({ x: (area.start.x + area.end.x) / 2, y: (area.start.y + area.end.y) / 2 }).y} r={(Math.hypot(area.end.x - area.start.x, area.end.y - area.start.y) / 2) * view.scale} fill="rgba(74,180,90,0.4)" stroke="#2f9e44" strokeWidth={2} strokeDasharray="7 4" />
            ) : (
              <>
                <polygon points={pts(area.poly)} fill="rgba(37,99,235,0.3)" stroke="#1d4ed8" strokeWidth={2.5} strokeDasharray="7 4" />
                <EdgeLabel a={area.poly[0]} b={area.poly[1]} toS={toS} />
                <EdgeLabel a={area.poly[1]} b={area.poly[2]} toS={toS} />
              </>
            )}
          </g>
        )}
        {/* drawing in progress */}
        {drawing && draft.length > 0 && (
          <g pointerEvents="none">
            {snap?.guides.map((g, i) => {
              const a = toS({ x: g.a.x - Math.cos(g.dir) * 500, y: g.a.y - Math.sin(g.dir) * 500 });
              const b = toS({ x: g.a.x + Math.cos(g.dir) * 500, y: g.a.y + Math.sin(g.dir) * 500 });
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="7 6" />;
            })}
            <polyline points={pts(snap ? [...draft, snap.p] : draft)} fill="none" stroke={tool === 'draw-zone' ? '#3b5bea' : BLUE} strokeWidth={3} strokeDasharray="7 5" />
            {draft.map((p, i) => i < draft.length - 1 && <EdgeLabel key={i} a={p} b={draft[i + 1]} toS={toS} />)}
            {snap && <EdgeLabel a={draft[draft.length - 1]} b={snap.p} toS={toS} />}
            {draft.map((p, i) => (
              <circle key={i} cx={toS(p).x} cy={toS(p).y} r={i === 0 && snap?.close ? 10 : 7} fill="#fff" stroke={BLUE} strokeWidth={3} />
            ))}
            {snap && <circle cx={toS(snap.p).x} cy={toS(snap.p).y} r={7} fill={ORANGE} />}
          </g>
        )}
        {sections.length > 0 && editSections && !drawing && (
          <text {...toS(polygonCentroid(sections[0].points))} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" pointerEvents="none" style={{ paintOrder: 'stroke', stroke: '#1e293b', strokeWidth: 3 }}>
            {design.roofArea.toFixed(1)} m²
          </text>
        )}
      </svg>
      <div className="pointer-events-none absolute bottom-2 right-3 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">Imagery © Google</div>
      {children}
    </div>
  );
}

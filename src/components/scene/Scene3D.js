'use client';

import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Calendar, Pause, Play, Sunrise, Sunset } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { offsetPolygon, rectPoly } from '@/lib/geometry';
import { PANEL_THICKNESS, roofHeightAt } from '@/lib/model';
import { staticMapSize, staticMapUrl } from '@/lib/staticMap';
import { useStore } from '@/lib/store';
import { dayLength, MONTHS, sunPosition } from '@/lib/sun';
import { cx } from '../ui';

export const sceneApi = { capture: null };

const SEASONS = { winter: 355, summer: 172, equinox: 80 };
const todayDoy = () => {
  const d = new Date();
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
};
export const dayFor = (season) => SEASONS[season] ?? todayDoy();
const fmtTime = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};
const fmtDate = (doy) => {
  const d = new Date(2026, 0, doy);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

function useSatellite(origin, zoom) {
  const [tex, setTex] = useState(null);
  const url = staticMapUrl({ lat: origin.lat, lng: origin.lng, zoom });
  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      setTex(t);
    });
    return () => (alive = false);
  }, [url]);
  return tex;
}

function ringGeo(outer, inner, height, base) {
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  if (inner?.length >= 3) shape.holes.push(new THREE.Path(inner.map((p) => new THREE.Vector2(p.x, p.y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, base, 0);
  return g;
}

function topGeo(poly, y, mapSize) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y))));
  const pos = g.attributes.position;
  const uv = [];
  for (let i = 0; i < pos.count; i++) uv.push(pos.getX(i) / mapSize + 0.5, pos.getY(i) / mapSize + 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

function Building({ section, tex, mapSize }) {
  const geos = useMemo(() => {
    const t = Math.min(section.parapetT || 0.23, 0.5);
    const inner = offsetPolygon(section.poly, t);
    return {
      body: ringGeo(section.poly, null, section.height, 0),
      top: topGeo(section.poly, section.height + 0.02, mapSize),
      parapet: section.parapetH > 0.05 && inner.length >= 3 ? ringGeo(section.poly, inner, section.parapetH, section.height) : null,
    };
  }, [section, mapSize]);
  useEffect(() => () => Object.values(geos).forEach((g) => g?.dispose()), [geos]);
  return (
    <group>
      <mesh geometry={geos.body} castShadow receiveShadow>
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
      <mesh geometry={geos.top} receiveShadow>
        <meshStandardMaterial key={tex ? 'sat' : 'plain'} map={tex} color={tex ? '#ffffff' : '#d6d3d1'} roughness={1} />
      </mesh>
      {geos.parapet && (
        <mesh geometry={geos.parapet} castShadow receiveShadow>
          <meshStandardMaterial color="#9ca3af" roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

function Instances({ items, geometry, children, cast = true }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    items.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return (
    <instancedMesh key={items.length} ref={ref} args={[geometry, undefined, items.length]} castShadow={cast} receiveShadow>
      {children}
    </instancedMesh>
  );
}

function PanelTables({ design }) {
  const data = useMemo(() => {
    const byDim = new Map();
    const legs = [];
    const blocks = [];
    const rails = [];
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const t of design.tables) {
      if (!t.valid) continue;
      const key = `${t.size.cross.toFixed(3)}|${t.size.slope.toFixed(3)}`;
      if (!byDim.has(key)) byDim.set(key, { cross: t.size.cross, slope: t.size.slope, list: [] });
      for (const m of t.modules) {
        e.set(...m.rotation);
        q.setFromEuler(e);
        byDim.get(key).list.push(new THREE.Matrix4().compose(new THREE.Vector3(...m.position), q, one));
      }
      for (const l of t.legs) {
        legs.push(new THREE.Matrix4().makeScale(1, l.h, 1).setPosition(l.x, l.base + l.h / 2, -l.y));
        blocks.push(new THREE.Matrix4().makeTranslation(l.x, l.base + 0.09, -l.y));
      }
      // two rails under the table following the tilt
      e.set(t.tilt * (Math.PI / 180), Math.PI - t.azimuth * (Math.PI / 180), 0, 'YXZ');
      q.setFromEuler(e);
      const mid = t.base + (t.frontLeg + t.backLeg) / 2 - 0.05;
      rails.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, mid, -t.y), q, new THREE.Vector3(t.size.width, 1, t.size.slopeLen)));
    }
    return { groups: [...byDim.values()], legs, blocks, rails };
  }, [design.tables]);

  const legGeo = useMemo(() => new THREE.BoxGeometry(0.06, 1, 0.06), []);
  const blockGeo = useMemo(() => new THREE.BoxGeometry(0.35, 0.18, 0.35), []);
  const frameGeo = useMemo(() => {
    // open frame: thin border only (4 bars) merged would be nicer; a thin slab reads fine from above
    return new THREE.BoxGeometry(1, 0.03, 1);
  }, []);

  return (
    <group>
      {data.groups.map((g) => (
        <PanelGroup key={`${g.cross}|${g.slope}`} group={g} />
      ))}
      <Instances items={data.rails} geometry={frameGeo}>
        <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.5} />
      </Instances>
      <Instances items={data.legs} geometry={legGeo}>
        <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.4} />
      </Instances>
      <Instances items={data.blocks} geometry={blockGeo}>
        <meshStandardMaterial color="#a8a29e" roughness={1} />
      </Instances>
    </group>
  );
}

function PanelGroup({ group }) {
  const geo = useMemo(() => new THREE.BoxGeometry(group.cross, PANEL_THICKNESS, group.slope), [group.cross, group.slope]);
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#d1d5db';
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#07090f';
    g.fillRect(3, 3, 122, 250);
    g.strokeStyle = 'rgba(148,163,184,0.18)';
    for (let i = 1; i < 6; i++) g.strokeRect(3 + (122 / 6) * i, 3, 0.5, 250);
    for (let i = 1; i < 12; i++) g.strokeRect(3, 3 + (250 / 12) * i, 122, 0.5);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  return (
    <Instances items={group.list} geometry={geo}>
      <meshStandardMaterial map={tex} roughness={0.25} metalness={0.35} />
    </Instances>
  );
}

function Tree({ t, base }) {
  const blobs = useMemo(() => {
    return treeBlobs(t);
  }, [t]);
  return (
    <TreeMesh t={t} base={base} blobs={blobs} />
  );
}

function treeBlobs(t) {
  const state = { seed: Math.abs(Math.round(t.x * 31 + t.y * 17)) + 1 };
  const rnd = () => (state.seed = (state.seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 9 }, (_, i) => {
      const a = rnd() * Math.PI * 2;
      const r = i === 0 ? 0 : t.r * 0.55 * rnd();
      return { p: [Math.cos(a) * r, t.h * (0.5 + 0.38 * rnd()), Math.sin(a) * r], s: t.r * (0.45 + 0.3 * rnd()) };
    });
}

function TreeMesh({ t, base, blobs }) {
  return (
    <group position={[t.x, base, -t.y]}>
      <mesh position={[0, t.h * 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, t.h * 0.5, 8]} />
        <meshStandardMaterial color="#5b4636" roughness={1} />
      </mesh>
      {blobs.map((b, i) => (
        <mesh key={i} position={b.p} castShadow>
          <icosahedronGeometry args={[b.s, 1]} />
          <meshStandardMaterial color={i % 2 ? '#3f7d3a' : '#2f6b33'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function SunPath({ lat, day, hour, radius }) {
  const { sunrise, sunset } = dayLength(lat, day);
  const at = (h) => {
    const s = sunPosition(lat, day, h);
    return [s.x * radius, Math.max(s.z, 0) * radius, -s.y * radius];
  };
  const pts = [];
  for (let h = sunrise; h <= sunset; h += 0.1) pts.push(at(h));
  const hours = [];
  for (let h = Math.ceil(sunrise); h <= Math.floor(sunset); h++) hours.push(h);
  const up = hour >= sunrise && hour <= sunset;
  return (
    <group>
      {pts.length > 1 && <Line points={pts} color="#f5c16c" lineWidth={2} />}
      {hours.map((h) => (
        <Html key={h} position={at(h)} center style={{ pointerEvents: 'none' }}>
          <span className="text-lg font-light text-white/70">{((h + 11) % 12) + 1}</span>
        </Html>
      ))}
      {up && (
        <mesh position={at(hour)}>
          <sphereGeometry args={[radius * 0.025, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
      )}
    </group>
  );
}

function Lights({ lat, day, hour, span }) {
  const s = sunPosition(lat, day, hour);
  const up = s.z > 0.02;
  const d = span * 2 + 40;
  const ext = span + 10;
  return (
    <>
      <ambientLight intensity={up ? 0.55 : 0.25} />
      <hemisphereLight args={['#dbeafe', '#1f2937', up ? 0.5 : 0.2]} />
      <directionalLight
        castShadow
        intensity={up ? 2.6 * Math.min(1, s.z * 3 + 0.25) : 0}
        position={[s.x * d, Math.max(s.z, 0.02) * d, -s.y * d]}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
        shadow-camera-left={-ext}
        shadow-camera-right={ext}
        shadow-camera-top={ext}
        shadow-camera-bottom={-ext}
        shadow-camera-far={d * 3}
      />
    </>
  );
}

function Bridge({ span, height }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { camera } = get();
    const d = Math.max(span * 1.25, 20);
    camera.position.set(-d * 0.55, height + d * 0.6, d * 0.75);
    sceneApi.capture = () => {
      const { gl, scene, camera: cam } = get();
      gl.render(scene, cam);
      return gl.domElement.toDataURL('image/jpeg', 0.9);
    };
    return () => (sceneApi.capture = null);
  }, [get, span, height]);
  return null;
}

export default function Scene3D({ design }) {
  const origin = useStore((s) => s.origin);
  const sun = useStore((s) => s.sun);
  const patch = useStore((s) => s.patch);
  const [playing, setPlaying] = useState(false);
  const day = dayFor(sun.season);
  const { sunrise, sunset } = dayLength(design.lat, day);

  const span = useMemo(() => {
    const p = design.sections.flatMap((s) => s.poly);
    if (!p.length) return 20;
    return Math.max(Math.max(...p.map((q) => q.x)) - Math.min(...p.map((q) => q.x)), Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y)), 12);
  }, [design.sections]);
  const maxH = Math.max(3, ...design.sections.map((s) => s.height));

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const { sun: cur, patch: p } = useStore.getState();
      const next = cur.hour + 0.1;
      p('sun', { hour: next > sunset ? sunrise : next });
    }, 60);
    return () => clearInterval(id);
  }, [playing, sunrise, sunset]);

  if (!origin) return null;
  return (
    <div className="absolute inset-0 bg-[#05070d]">
      <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 42, near: 0.3, far: 5000 }}>
        <color attach="background" args={['#05070d']} />
        <SceneContent design={design} origin={origin} day={day} hour={sun.hour} span={span} maxH={maxH} />
        <OrbitControls makeDefault enableDamping target={[0, maxH * 0.6, 0]} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={3} maxDistance={span * 8} />
        <Bridge span={span} height={maxH} />
      </Canvas>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-6 pb-4 pt-10">
        <div className="flex gap-2">
          {['winter', 'summer', 'equinox', 'today'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => patch('sun', { season: k })}
              className={cx('rounded-full px-4 py-1.5 text-sm font-medium capitalize transition', sun.season === k ? 'bg-[#f5a524] text-white' : 'bg-white/20 text-white hover:bg-white/30')}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-base font-medium text-white">
          <Calendar className="h-4 w-4" /> {fmtDate(day)}
        </div>
        <div className="flex w-full max-w-5xl items-center gap-4">
          <button type="button" onClick={() => setPlaying((v) => !v)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30">
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <span className="w-20 text-sm text-white/90">{fmtTime(sun.hour)}</span>
          <input type="range" min={Math.floor(sunrise)} max={Math.ceil(sunset)} step={0.05} value={sun.hour} onChange={(e) => patch('sun', { hour: Number(e.target.value) })} className="h-1 flex-1 accent-[#f5a524]" />
        </div>
        <div className="flex gap-5 text-xs text-white/70">
          <span className="flex items-center gap-1">
            <Sunrise className="h-3.5 w-3.5 text-amber-400" /> Sunrise: {fmtTime(sunrise)}
          </span>
          <span className="flex items-center gap-1">
            <Sunset className="h-3.5 w-3.5 text-amber-400" /> Sunset: {fmtTime(sunset)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SceneContent({ design, origin, day, hour, span, maxH }) {
  const texNear = useSatellite(origin, 20);
  const texFar = useSatellite(origin, 18);
  const nearSize = staticMapSize(origin.lat, 20);
  const farSize = staticMapSize(origin.lat, 18);
  return (
    <>
      <Lights lat={design.lat} day={day} hour={hour} span={span} />
      <SunPath lat={design.lat} day={day} hour={hour} radius={span * 1.6 + 25} />
      <gridHelper args={[farSize * 3, 60, '#1f2937', '#111827']} position={[0, -0.06, 0]} />
      {texFar && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
          <planeGeometry args={[farSize, farSize]} />
          <meshStandardMaterial map={texFar} roughness={1} />
        </mesh>
      )}
      {texNear && (
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[nearSize, nearSize]} />
          <meshStandardMaterial map={texNear} roughness={1} />
        </mesh>
      )}
      {design.sections.map((s) => (
        <Building key={s.id} section={s} tex={texNear} mapSize={nearSize} />
      ))}
      {design.blocks.map((b) => {
        const base = roofHeightAt(design.sections, b.x, b.y);
        const c = rectPoly(b.x, b.y, b.w, b.d, b.rot || 0);
        const ang = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
        return (
          <mesh key={b.id} position={[b.x, base + b.h / 2, -b.y]} rotation-y={ang} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color="#8b9099" roughness={0.9} />
          </mesh>
        );
      })}
      {design.trees.map((t) => (
        <Tree key={t.id} t={t} base={roofHeightAt(design.sections, t.x, t.y)} />
      ))}
      <PanelTables design={design} />
    </>
  );
}

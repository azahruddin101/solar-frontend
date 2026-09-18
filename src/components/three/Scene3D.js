'use client';

import { OrbitControls, Sky } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Hand, MousePointerClick, Navigation, SunMedium } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { bounds, convexOverlap, pointInPolygon, polygonCentroid } from '@/lib/geometry';
import { computePanelPose, newPanelId } from '@/lib/panels';
import { sceneApi } from '@/lib/sceneApi';
import { staticMapSize, staticMapUrl, zoomForSpan } from '@/lib/staticMap';
import { useStore } from '@/lib/store';
import { dayOfYear, MONTHS, sunPosition } from '@/lib/sun';
import { cx, Kbd } from '../ui';
import House from './House';
import Panels from './Panels';

function Ground({ origin, span }) {
  const zoom = zoomForSpan(origin.lat, span, 3.2);
  const size = staticMapSize(origin.lat, zoom);
  const url = staticMapUrl({ lat: origin.lat, lng: origin.lng, zoom });
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (t) => {
        if (!alive) return t.dispose();
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTexture(t);
      },
      undefined,
      () => alive && setTexture(null),
    );
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
        <circleGeometry args={[Math.max(size * 3, 400), 64]} />
        <meshStandardMaterial color="#a3ad8f" roughness={1} />
      </mesh>
      {texture && (
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial map={texture} roughness={1} />
        </mesh>
      )}
    </group>
  );
}

function SunLight({ lat, month, hour, span, center }) {
  const s = sunPosition(lat, dayOfYear(month), hour);
  const up = s.altitude > 0;
  const dir = new THREE.Vector3(s.x, Math.max(s.z, 0.02), -s.y).normalize();
  const dist = span * 2 + 60;
  const light = useRef(null);
  const ext = span * 0.9 + 8;

  useEffect(() => {
    if (!light.current) return;
    light.current.target.position.set(center.x, 0, -center.y);
    light.current.target.updateMatrixWorld();
  }, [center.x, center.y]);

  return (
    <>
      <Sky sunPosition={[dir.x, dir.y, dir.z]} turbidity={7} rayleigh={up ? 1.4 : 3} mieCoefficient={0.004} mieDirectionalG={0.85} distance={4500} />
      <hemisphereLight args={['#e0ecff', '#6b715e', up ? 0.9 : 0.35]} />
      <directionalLight
        ref={light}
        castShadow
        intensity={up ? 2.8 : 0}
        position={[center.x + dir.x * dist, dir.y * dist, -center.y + dir.z * dist]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-ext}
        shadow-camera-right={ext}
        shadow-camera-top={ext}
        shadow-camera-bottom={-ext}
        shadow-camera-near={1}
        shadow-camera-far={dist * 3}
      />
    </>
  );
}

/** Registers camera presets + snapshot capture; keeps the HTML compass in sync. */
function SceneBridge({ center, span, height, compassRef }) {
  const { camera, gl, scene, controls } = useThree();
  const target = useMemo(() => new THREE.Vector3(center.x, height * 0.45, -center.y), [center.x, center.y, height]);

  useEffect(() => {
    const place = (view) => {
      const d = Math.max(span * 1.7, 22);
      const presets = {
        iso: [d * 0.55, d * 0.55, d * 0.75],
        top: [0.001, d * 1.35, 0.001],
        south: [0, d * 0.3, d * 1.1],
        east: [d * 1.1, d * 0.3, 0],
        west: [-d * 1.1, d * 0.3, 0],
        north: [0, d * 0.3, -d * 1.1],
      };
      const p = presets[view] || presets.iso;
      camera.position.set(target.x + p[0], target.y + p[1], target.z + p[2]);
      if (controls) {
        controls.target.copy(target);
        controls.update();
      } else camera.lookAt(target);
    };
    sceneApi.setView = place;
    sceneApi.capture = async () => {
      const saved = { pos: camera.position.clone(), target: controls?.target.clone() };
      place('iso');
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL('image/jpeg', 0.92);
      camera.position.copy(saved.pos);
      if (controls && saved.target) {
        controls.target.copy(saved.target);
        controls.update();
      }
      return url;
    };
    return () => {
      sceneApi.setView = null;
      sceneApi.capture = null;
    };
  }, [camera, gl, scene, controls, span, target]);

  // initial framing
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || !controls) return;
    framed.current = true;
    sceneApi.setView?.('iso');
  }, [controls]);

  useFrame(() => {
    if (!compassRef.current || !controls) return;
    const dx = controls.target.x - camera.position.x;
    const dz = controls.target.z - camera.position.z;
    const heading = Math.atan2(dx, -dz); // 0 = looking north
    compassRef.current.style.transform = `rotate(${-heading}rad)`;
  });
  return null;
}

export default function Scene3D({ design }) {
  const { origin, footprint, roof, poses, spec, building } = design;
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const array = useStore((s) => s.array);
  const sun = useStore((s) => s.sun);
  const setSun = useStore((s) => s.setSun);
  const roofRef = useRef(null);
  const compassRef = useRef(null);
  const [ghostAt, setGhostAt] = useState(null);

  const b = useMemo(() => bounds(footprint), [footprint]);
  const center = useMemo(() => polygonCentroid(footprint), [footprint]);
  const span = Math.max(b.width, b.height, 8);

  const draft = (x, y) => ({
    id: 'ghost',
    x,
    y,
    tilt: array.tilt,
    azimuth: array.azimuth,
    flush: array.mount === 'flush',
    orientation: array.orientation,
  });

  const ghost = useMemo(() => {
    if (tool !== 'add' || !ghostAt || !roof) return null;
    const pose = computePanelPose(draft(ghostAt.x, ghostAt.y), spec, roof, footprint);
    const ok = pose.valid && pointInPolygon(ghostAt, footprint) && !poses.some((p) => convexOverlap(p.corners, pose.corners, 0.02));
    return { pose, ok };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, ghostAt, roof, spec, footprint, poses, array]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId) {
        e.preventDefault();
        st.removePanel(st.selectedId);
      } else if (e.key === 'Escape') {
        st.select(null);
        st.setTool('select');
      } else if (e.key === 'a' || e.key === 'A') {
        st.setTool(st.tool === 'add' ? 'select' : 'add');
      } else if ((e.key === 'r' || e.key === 'R') && st.selectedId) {
        const p = st.panels.find((x) => x.id === st.selectedId);
        if (p) st.updatePanel(p.id, { orientation: p.orientation === 'portrait' ? 'landscape' : 'portrait' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!roof || !origin) return null;

  const onRoofClick = (e) => {
    e.stopPropagation();
    const st = useStore.getState();
    if (st.tool !== 'add') {
      st.select(null);
      return;
    }
    if (!ghost?.ok) return;
    const p = { x: e.point.x, y: -e.point.z };
    st.addPanel({ ...draft(p.x, p.y), id: newPanelId(), custom: false });
  };
  const onRoofMove = (e) => {
    if (tool !== 'add') return;
    setGhostAt({ x: e.point.x, y: -e.point.z });
  };

  const sunPos = sunPosition(origin.lat, dayOfYear(sun.month), sun.hour);

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 40, near: 0.3, far: 20000, position: [30, 25, 30] }}
        onPointerMissed={() => useStore.getState().select(null)}
      >
        <SunLight lat={origin.lat} month={sun.month} hour={sun.hour} span={span} center={center} />
        <Ground origin={origin} span={span} />
        <House
          footprint={footprint}
          roof={roof}
          building={building}
          roofRef={roofRef}
          onRoofClick={onRoofClick}
          onRoofMove={onRoofMove}
          onRoofLeave={() => setGhostAt(null)}
        />
        <Panels poses={poses} roofRef={roofRef} ghost={ghost} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          minDistance={4}
          maxDistance={span * 8 + 60}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
        <SceneBridge center={center} span={span} height={roof.ridgeH} compassRef={compassRef} />
      </Canvas>

      {/* toolbar */}
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1 rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-slate-200 backdrop-blur">
        <button
          type="button"
          onClick={() => setTool('select')}
          className={cx('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium', tool === 'select' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
        >
          <Hand className="h-3.5 w-3.5" /> Select / move
        </button>
        <button
          type="button"
          onClick={() => setTool('add')}
          className={cx('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium', tool === 'add' ? 'bg-amber-500 text-slate-950' : 'text-slate-600 hover:bg-slate-100')}
        >
          <MousePointerClick className="h-3.5 w-3.5" /> Add panel <Kbd>A</Kbd>
        </button>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        {[
          ['iso', '3D'],
          ['top', 'Top'],
          ['south', 'S'],
          ['east', 'E'],
          ['north', 'N'],
          ['west', 'W'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => sceneApi.setView?.(id)}
            className="h-8 min-w-8 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            {label}
          </button>
        ))}
      </div>

      {tool === 'add' && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs text-white">
          Click on the roof to place a panel · <Kbd>Esc</Kbd> to stop
        </div>
      )}

      {/* compass */}
      <div className="absolute right-3 top-3 grid h-14 w-14 place-items-center rounded-full bg-white/95 shadow-lg ring-1 ring-slate-200">
        <div ref={compassRef} className="relative grid h-12 w-12 place-items-center">
          <Navigation className="h-5 w-5 fill-red-500 text-red-600" />
          <span className="absolute top-0 text-[9px] font-bold text-red-600">N</span>
        </div>
      </div>

      {/* sun study */}
      <div className="absolute bottom-3 left-3 w-64 rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1.5">
            <SunMedium className="h-4 w-4 text-amber-500" /> Sun &amp; shadows
          </span>
          <span className="font-mono font-normal text-slate-500">
            {sunPos.altitude > 0 ? `alt ${sunPos.altitude.toFixed(0)}° · az ${sunPos.azimuth.toFixed(0)}°` : 'below horizon'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sun.month}
            onChange={(e) => setSun({ month: Number(e.target.value) })}
            className="h-7 rounded-md bg-slate-100 px-1.5 text-xs outline-none"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m} 21
              </option>
            ))}
          </select>
          <input
            type="range"
            min={5}
            max={19}
            step={0.25}
            value={sun.hour}
            onChange={(e) => setSun({ hour: Number(e.target.value) })}
            className="h-1.5 flex-1 accent-amber-500"
          />
          <span className="w-10 text-right font-mono text-xs text-slate-600">
            {String(Math.floor(sun.hour)).padStart(2, '0')}:{String(Math.round((sun.hour % 1) * 60)).padStart(2, '0')}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400">Local solar time</div>
      </div>
    </div>
  );
}

'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PANEL_THICKNESS } from '@/lib/panels';
import { useStore } from '@/lib/store';

function cellTexture(cols, rows) {
  const px = 40;
  const canvas = document.createElement('canvas');
  canvas.width = cols * px;
  canvas.height = rows * px;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d8dee6';
  g.fillRect(0, 0, canvas.width, canvas.height);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = c * px + 1.5;
      const y = r * px + 1.5;
      const grad = g.createLinearGradient(x, y, x + px, y + px);
      grad.addColorStop(0, '#1d3557');
      grad.addColorStop(1, '#0f1d33');
      g.fillStyle = grad;
      g.fillRect(x, y, px - 3, px - 3);
      g.fillStyle = 'rgba(180,200,230,0.25)';
      for (let k = 1; k < 4; k++) g.fillRect(x + ((px - 3) * k) / 4, y, 0.8, px - 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function usePanelMaterials() {
  return useMemo(() => {
    const frame = new THREE.MeshStandardMaterial({ color: '#b8c0cc', metalness: 0.7, roughness: 0.35 });
    const back = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.8 });
    const portrait = new THREE.MeshStandardMaterial({ map: cellTexture(6, 10), roughness: 0.22, metalness: 0.25 });
    const landscape = new THREE.MeshStandardMaterial({ map: cellTexture(10, 6), roughness: 0.22, metalness: 0.25 });
    const ghostOk = new THREE.MeshStandardMaterial({ color: '#fbbf24', transparent: true, opacity: 0.55, depthWrite: false });
    const ghostBad = new THREE.MeshStandardMaterial({ color: '#ef4444', transparent: true, opacity: 0.55, depthWrite: false });
    return {
      // BoxGeometry groups: +x, -x, +y(top), -y, +z, -z
      portrait: [frame, frame, portrait, back, frame, frame],
      landscape: [frame, frame, landscape, back, frame, frame],
      ghostOk,
      ghostBad,
      post: new THREE.MeshStandardMaterial({ color: '#9ca3af', metalness: 0.6, roughness: 0.4 }),
    };
  }, []);
}

const NORMAL = new THREE.Color('#ffffff');
const SELECTED = new THREE.Color('#ffc861');
const INVALID = new THREE.Color('#ff7a7a');

function PanelInstances({ poses, material, selectedId, onDown, onOver, onOut }) {
  const ref = useRef(null);
  const dims = poses[0].dims;
  const geometry = useMemo(() => new THREE.BoxGeometry(dims.cross, PANEL_THICKNESS, dims.slope), [dims.cross, dims.slope]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    poses.forEach((p, i) => {
      e.set(...p.rotation);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...p.position), q, one);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, p.id === selectedId ? SELECTED : p.valid ? NORMAL : INVALID);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poses, selectedId]);

  return (
    <instancedMesh
      key={poses.length}
      ref={ref}
      args={[geometry, material, poses.length]}
      castShadow
      receiveShadow
      onPointerDown={(e) => onDown(e, poses[e.instanceId])}
      onPointerOver={(e) => onOver(e, poses[e.instanceId])}
      onPointerOut={onOut}
    />
  );
}

function Posts({ poses, material }) {
  const ref = useRef(null);
  const posts = useMemo(() => {
    const list = [];
    for (const p of poses) {
      for (const c of p.corners) {
        const top = c.z - PANEL_THICKNESS / 2;
        const len = top - c.roofZ;
        if (len > 0.06) list.push({ x: c.x, y: c.y, z: (top + c.roofZ) / 2, len });
      }
    }
    return list;
  }, [poses]);
  const box = useMemo(() => new THREE.BoxGeometry(0.04, 1, 0.04), []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const m = new THREE.Matrix4();
    posts.forEach((p, i) => {
      m.makeScale(1, p.len, 1);
      m.setPosition(p.x, p.z, -p.y);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [posts]);

  if (!posts.length) return null;
  return <instancedMesh key={posts.length} ref={ref} args={[box, material, posts.length]} castShadow raycast={() => null} />;
}

function SelectionOutline({ pose }) {
  const geo = useMemo(() => {
    const box = new THREE.BoxGeometry(pose.dims.cross + 0.06, PANEL_THICKNESS + 0.04, pose.dims.slope + 0.06);
    return new THREE.EdgesGeometry(box);
  }, [pose.dims.cross, pose.dims.slope]);
  return (
    <lineSegments geometry={geo} position={pose.position} rotation={pose.rotation} raycast={() => null}>
      <lineBasicMaterial color="#f59e0b" />
    </lineSegments>
  );
}

export function GhostPanel({ pose, ok, materials }) {
  const geo = useMemo(() => new THREE.BoxGeometry(pose.dims.cross, PANEL_THICKNESS, pose.dims.slope), [pose.dims.cross, pose.dims.slope]);
  return <mesh geometry={geo} position={pose.position} rotation={pose.rotation} material={ok ? materials.ghostOk : materials.ghostBad} raycast={() => null} />;
}

/**
 * Renders all panels (instanced, grouped by orientation) and handles select / drag-to-move.
 */
export default function Panels({ poses, roofRef, ghost }) {
  const materials = usePanelMaterials();
  const selectedId = useStore((s) => s.selectedId);
  const tool = useStore((s) => s.tool);
  const get = useThree((s) => s.get);
  const drag = useRef(null);

  const groups = useMemo(() => {
    const byKey = new Map();
    for (const p of poses) {
      const key = `${p.dims.cross.toFixed(3)}x${p.dims.slope.toFixed(3)}`;
      if (!byKey.has(key)) byKey.set(key, { key, landscape: p.dims.cross > p.dims.slope, list: [] });
      byKey.get(key).list.push(p);
    }
    return [...byKey.values()];
  }, [poses]);

  const selectedPose = poses.find((p) => p.id === selectedId);

  // drag handling on window so the pointer can leave the panel
  useEffect(() => {
    const el = get().gl.domElement;
    const ndc = new THREE.Vector2();
    let frame = 0;
    const onMove = (ev) => {
      const d = drag.current;
      if (!d || !roofRef.current) return;
      const rect = el.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      const { raycaster, camera } = get();
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(roofRef.current, true)[0];
      if (!hit) return;
      d.moved = true;
      const x = hit.point.x + d.dx;
      const y = -hit.point.z + d.dy;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => useStore.getState().updatePanel(d.id, { x, y }));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      const { controls } = get();
      if (controls) controls.enabled = true;
      el.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [get, roofRef]);

  const onDown = (e, pose) => {
    if (!pose) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    useStore.getState().select(pose.id);
    if (tool !== 'select') return;
    drag.current = { id: pose.id, dx: pose.center.x - e.point.x, dy: pose.center.y + e.point.z };
    const { controls, gl } = get();
    if (controls) controls.enabled = false;
    gl.domElement.style.cursor = 'grabbing';
  };

  return (
    <group>
      {groups.map((g) => (
        <PanelInstances
          key={g.key}
          poses={g.list}
          material={g.landscape ? materials.landscape : materials.portrait}
          selectedId={selectedId}
          onDown={onDown}
          onOver={(e) => {
            e.stopPropagation();
            if (!drag.current) get().gl.domElement.style.cursor = tool === 'select' ? 'grab' : 'pointer';
          }}
          onOut={() => {
            if (!drag.current) get().gl.domElement.style.cursor = '';
          }}
        />
      ))}
      <Posts poses={poses} material={materials.post} />
      {selectedPose && <SelectionOutline pose={selectedPose} />}
      {ghost && <GhostPanel pose={ghost.pose} ok={ghost.ok} materials={materials} />}
    </group>
  );
}

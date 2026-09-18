'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildHouse, openings } from './houseGeometry';

function Openings({ footprint, building }) {
  const items = useMemo(() => (building.showWindows ? openings(footprint, building) : []), [footprint, building]);
  const frameRef = useRef(null);
  const glassRef = useRef(null);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);

  useLayoutEffect(() => {
    if (!frameRef.current || !glassRef.current) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const glassColor = new THREE.Color('#29435c');
    const doorColor = new THREE.Color('#6b4428');
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rotY);
      const out = new THREE.Vector3(Math.sin(it.rotY), 0, Math.cos(it.rotY));
      const base = new THREE.Vector3(it.x, it.z, -it.y);
      m.compose(base, q, new THREE.Vector3(it.w + 0.14, it.h + 0.14, 0.05));
      frameRef.current.setMatrixAt(i, m);
      m.compose(base.clone().addScaledVector(out, 0.02), q, new THREE.Vector3(it.w, it.h, 0.05));
      glassRef.current.setMatrixAt(i, m);
      glassRef.current.setColorAt(i, it.type === 'door' ? doorColor : glassColor);
    });
    frameRef.current.instanceMatrix.needsUpdate = true;
    glassRef.current.instanceMatrix.needsUpdate = true;
    if (glassRef.current.instanceColor) glassRef.current.instanceColor.needsUpdate = true;
  }, [items]);

  if (!items.length) return null;
  return (
    <group>
      <instancedMesh key={`f${items.length}`} ref={frameRef} args={[box, undefined, items.length]} castShadow>
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </instancedMesh>
      <instancedMesh key={`g${items.length}`} ref={glassRef} args={[box, undefined, items.length]}>
        <meshStandardMaterial color="#ffffff" roughness={0.15} metalness={0.3} />
      </instancedMesh>
    </group>
  );
}

export default function House({ footprint, roof, building, roofRef, onRoofClick, onRoofMove, onRoofLeave }) {
  const geos = useMemo(() => buildHouse(footprint, roof, building), [footprint, roof, building]);
  useLayoutEffect(
    () => () => {
      Object.values(geos)
        .flat()
        .forEach((g) => g?.dispose?.());
    },
    [geos],
  );

  const pitched = roof.type !== 'flat';
  const roofColor = pitched ? building.roofColor : '#b9b4ab';

  return (
    <group>
      <mesh geometry={geos.walls} castShadow receiveShadow>
        <meshStandardMaterial color={building.wallColor} roughness={0.85} />
      </mesh>
      <mesh geometry={geos.plinth} castShadow receiveShadow>
        <meshStandardMaterial color="#8d8a84" roughness={0.9} />
      </mesh>
      {geos.bands.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.7} />
        </mesh>
      ))}
      {geos.slabEdge && (
        <mesh geometry={geos.slabEdge} castShadow receiveShadow>
          <meshStandardMaterial color="#f5f5f4" roughness={0.7} />
        </mesh>
      )}
      {geos.parapet && (
        <mesh geometry={geos.parapet} castShadow receiveShadow>
          <meshStandardMaterial color={building.wallColor} roughness={0.85} />
        </mesh>
      )}
      {geos.coping && (
        <mesh geometry={geos.coping} castShadow receiveShadow>
          <meshStandardMaterial color="#f1f5f9" roughness={0.6} />
        </mesh>
      )}
      {geos.fascia && (
        <mesh geometry={geos.fascia} castShadow>
          <meshStandardMaterial color="#e7e5e4" roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
      <group ref={roofRef}>
        {geos.roofFaces.map((g, i) => (
          <mesh
            key={i}
            geometry={g}
            castShadow
            receiveShadow
            onClick={onRoofClick}
            onPointerMove={onRoofMove}
            onPointerOut={onRoofLeave}
          >
            <meshStandardMaterial color={roofColor} roughness={pitched ? 0.75 : 0.95} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      <Openings footprint={footprint} building={building} />
    </group>
  );
}

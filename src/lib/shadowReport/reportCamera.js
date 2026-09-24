// The report's own camera: the same 3/4 aerial view for all renders, framed from the design's bounds
// rather than from wherever the user left the interactive camera.

import * as THREE from 'three';
import { DEG } from '../geo.js';
import { REPORT_CAMERA } from './config.js';

/**
 * A perspective camera looking at the centre of `bounds` from the configured azimuth and elevation,
 * pulled back just far enough for every corner of the bounds to fit inside `fill` of the frame.
 * @param {THREE.Box3} bounds  scene axes
 * @param {number} aspect      width / height of the render
 */
export function createReportCamera(bounds, aspect, opts = REPORT_CAMERA) {
  const { fov, azimuthDeg, elevationDeg, fill } = opts;
  const center = bounds.getCenter(new THREE.Vector3());
  // direction from the target towards the camera
  const el = elevationDeg * DEG;
  const az = azimuthDeg * DEG;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  const tanV = Math.tan((fov / 2) * DEG) * fill;
  const tanH = tanV * aspect;

  // smallest distance at which every corner projects inside the frame
  let distance = 1;
  const corner = new THREE.Vector3();
  const o = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
    o.subVectors(corner, center);
    const along = o.dot(dir);
    distance = Math.max(distance, along + Math.abs(o.dot(right)) / tanH, along + Math.abs(o.dot(up)) / tanV);
  }
  distance = Math.max(distance, 8);

  const camera = new THREE.PerspectiveCamera(fov, aspect, Math.max(0.3, distance * 0.02), distance * 20 + 1000);
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

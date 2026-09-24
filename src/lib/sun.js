// Sun geometry and a clear-sky irradiance model used to compare panel orientations
// and to shape monthly production. Absolute yield is calibrated from the Solar API.

import { DEG, normalizeAzimuth } from './geo.js';

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthOfDay(day) {
  for (let m = 0; m < 12; m++) if (day <= MONTH_START[m + 1]) return m;
  return 11;
}

/** Day of year for the 21st of a month (0-based month). */
export function dayOfYear(month, dayOfMonth = 21) {
  return MONTH_START[month] + dayOfMonth;
}

/**
 * Below this height of the unit sun vector (z ≈ sin altitude, about 1.1°) the 3D viewer switches the
 * sun light off: there is no direct sunlight. The shadow report uses the same threshold.
 */
export const SUN_UP_MIN_Z = 0.02;

function declination(day) {
  return 23.45 * DEG * Math.sin((2 * Math.PI * (284 + day)) / 365);
}

/**
 * Sun direction in local ENU for a given latitude, day of year and *solar* time (hours).
 * Returns unit vector {x: east, y: north, z: up}, altitude and azimuth in degrees.
 */
export function sunPosition(lat, day, solarHour) {
  const phi = lat * DEG;
  const d = declination(day);
  const w = (solarHour - 12) * 15 * DEG;
  const x = -Math.cos(d) * Math.sin(w);
  const y = Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(w);
  const z = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(w);
  return {
    x,
    y,
    z,
    altitude: Math.asin(Math.max(-1, Math.min(1, z))) / DEG,
    azimuth: normalizeAzimuth(Math.atan2(x, y) / DEG),
  };
}

const DAY_STEP = 2;
const HOUR_STEP = 0.25;
const ALBEDO = 0.2;
const cache = new Map();

function createSunModel(lat) {
  const sx = [];
  const sy = [];
  const sz = [];
  const dni = [];
  const dhi = [];
  const ghi = [];
  const month = [];
  for (let day = 1; day <= 365; day += DAY_STEP) {
    const i0 = 1361 * (1 + 0.033 * Math.cos((2 * Math.PI * day) / 365));
    const m = monthOfDay(day);
    for (let h = HOUR_STEP / 2; h < 24; h += HOUR_STEP) {
      const s = sunPosition(lat, day, h);
      if (s.z <= 0.02) continue;
      const zenith = Math.acos(s.z) / DEG;
      const airMass = 1 / (s.z + 0.50572 * Math.pow(96.07995 - zenith, -1.6364));
      const beam = i0 * Math.pow(0.7, Math.pow(airMass, 0.678));
      const diffuse = 0.1 * beam + 20 * s.z;
      sx.push(s.x);
      sy.push(s.y);
      sz.push(s.z);
      dni.push(beam);
      dhi.push(diffuse);
      ghi.push(beam * s.z + diffuse);
      month.push(m);
    }
  }
  const n = sx.length;
  const weight = (DAY_STEP * HOUR_STEP) / 1000; // Wh -> kWh, scaled for sampling
  const arr = (a) => Float32Array.from(a);
  const S = { sx: arr(sx), sy: arr(sy), sz: arr(sz), dni: arr(dni), dhi: arr(dhi), ghi: arr(ghi), month: Uint8Array.from(month) };

  function poa(tilt, azimuth, monthly = null) {
    const b = tilt * DEG;
    const g = azimuth * DEG;
    const nx = Math.sin(b) * Math.sin(g);
    const ny = Math.sin(b) * Math.cos(g);
    const nz = Math.cos(b);
    const sky = (1 + nz) / 2;
    const ground = (ALBEDO * (1 - nz)) / 2;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const cos = S.sx[i] * nx + S.sy[i] * ny + S.sz[i] * nz;
      const e = (cos > 0 ? S.dni[i] * cos : 0) + S.dhi[i] * sky + S.ghi[i] * ground;
      total += e;
      if (monthly) monthly[S.month[i]] += e * weight;
    }
    return total * weight;
  }

  let optimum = null;
  function optimal() {
    if (optimum) return optimum;
    let best = { tilt: 0, azimuth: lat >= 0 ? 180 : 0, poa: poa(0, 180) };
    for (let tilt = 0; tilt <= 70; tilt += 2) {
      for (let az = 0; az < 360; az += 10) {
        const v = poa(tilt, az);
        if (v > best.poa) best = { tilt, azimuth: az, poa: v };
      }
    }
    const coarse = best;
    for (let tilt = Math.max(0, coarse.tilt - 2); tilt <= coarse.tilt + 2; tilt += 0.5) {
      for (let az = coarse.azimuth - 10; az <= coarse.azimuth + 10; az += 1) {
        const v = poa(tilt, normalizeAzimuth(az));
        if (v > best.poa) best = { tilt, azimuth: normalizeAzimuth(az), poa: v };
      }
    }
    optimum = best;
    return best;
  }

  function monthly(tilt, azimuth) {
    const m = new Array(12).fill(0);
    poa(tilt, azimuth, m);
    return m;
  }

  return { lat, poa, optimal, monthly };
}

/** Memoised per ~0.1° latitude. */
export function getSunModel(lat) {
  const key = Math.round(lat * 10) / 10;
  if (!cache.has(key)) cache.set(key, createSunModel(key));
  return cache.get(key);
}

/** Coarse clear-sky samples (21st of each month, hourly) for shading analysis. */
export function sunSamples(lat) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    const day = dayOfYear(m);
    const i0 = 1361 * (1 + 0.033 * Math.cos((2 * Math.PI * day) / 365));
    for (let h = 5.5; h < 19; h += 1) {
      const s = sunPosition(lat, day, h);
      if (s.z <= 0.05) continue;
      const zen = Math.acos(s.z) / DEG;
      const am = 1 / (s.z + 0.50572 * Math.pow(96.07995 - zen, -1.6364));
      const dni = i0 * Math.pow(0.7, Math.pow(am, 0.678));
      out.push({ x: s.x, y: s.y, z: s.z, dni, dhi: 0.1 * dni + 20 * s.z });
    }
  }
  return out;
}

/** Sunrise / sunset in solar hours for a day of year. */
export function dayLength(lat, day) {
  const d = 23.45 * DEG * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const c = -Math.tan(lat * DEG) * Math.tan(d);
  const w = Math.acos(Math.max(-1, Math.min(1, c))) / DEG / 15;
  return { sunrise: 12 - w, sunset: 12 + w };
}

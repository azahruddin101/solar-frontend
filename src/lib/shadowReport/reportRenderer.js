// One dedicated high-resolution renderer for the whole report: it draws the live scene (the same
// objects, materials, lights and shadow settings as the viewer) with the report camera, then lays
// the information card over the picture on a 2D canvas.

import * as THREE from 'three';
import { IMAGE_QUALITY, RENDER_SIZES } from './config.js';

/**
 * @typedef {Object} OverlayInfo
 * @property {string} seasonLabel
 * @property {string} timeLabel
 * @property {string} dateLabel
 * @property {boolean} sunUp
 * @property {number|null} effectiveOutputPercent
 * @property {number|null} shadedAreaPercent
 * @property {number|null} backlitPercent
 * @property {number} sunAltitude
 * @property {number} sunAzimuth
 * @property {string} sunCompass
 * @property {number} panelCount
 * @property {string} [buildingLabel]  set only when the design has more than one building
 */

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
const pctText = (v) => `${Math.round(v)}%`;

/** The semi-transparent information card in the top-left corner, scaled with the image height. */
export function drawOverlay(ctx, width, height, info) {
  const k = (height / 1440) * 1.45; // design units: a 1440 px tall frame, scaled up so the card stays legible in the PDF grid
  const pad = 28 * k;
  const x = pad;
  const y = pad;
  const w = 560 * k;
  const h = (info.sunUp ? 372 : 300) * k;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 30 * k;
  ctx.shadowOffsetY = 8 * k;
  roundedRect(ctx, x, y, w, h, 18 * k);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.80)';
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, x, y, w, h, 18 * k);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2 * k;
  ctx.stroke();

  const left = x + 36 * k;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // season · time
  ctx.fillStyle = '#fbbf24';
  ctx.font = `700 ${22 * k}px ${FONT}`;
  ctx.letterSpacing = `${3 * k}px`;
  ctx.fillText(info.seasonLabel.toUpperCase(), left, y + 58 * k);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${48 * k}px ${FONT}`;
  ctx.fillText(info.timeLabel, left, y + 112 * k);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = `400 ${22 * k}px ${FONT}`;
  ctx.fillText(info.dateLabel, left, y + 146 * k);

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1.5 * k;
  ctx.beginPath();
  ctx.moveTo(left, y + 172 * k);
  ctx.lineTo(x + w - 36 * k, y + 172 * k);
  ctx.stroke();

  if (info.sunUp) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `600 ${18 * k}px ${FONT}`;
    ctx.letterSpacing = `${2 * k}px`;
    ctx.fillText('EFFECTIVE SOLAR OUTPUT', left, y + 212 * k);
    ctx.letterSpacing = '0px';
    const v = info.effectiveOutputPercent ?? 0;
    ctx.fillStyle = v >= 90 ? '#4ade80' : v >= 60 ? '#fbbf24' : '#f87171';
    ctx.font = `700 ${84 * k}px ${FONT}`;
    ctx.fillText(pctText(v), left, y + 292 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `400 ${22 * k}px ${FONT}`;
    ctx.fillText('Shaded area', left, y + 336 * k);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${26 * k}px ${FONT}`;
    ctx.fillText(pctText(info.shadedAreaPercent ?? 0), left + 150 * k, y + 336 * k);
    if ((info.backlitPercent ?? 0) >= 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `400 ${22 * k}px ${FONT}`;
      ctx.fillText('Facing away', left + 270 * k, y + 336 * k);
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${26 * k}px ${FONT}`;
      ctx.fillText(pctText(info.backlitPercent), left + 428 * k, y + 336 * k);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${38 * k}px ${FONT}`;
    ctx.fillText('No Direct Sunlight', left, y + 226 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = `400 ${24 * k}px ${FONT}`;
    ctx.fillText('Effective Solar Output: N/A', left, y + 266 * k);
  }

  // sun position, bottom-right, small
  const caption = info.sunUp
    ? `Sun altitude ${info.sunAltitude.toFixed(0)}°  ·  azimuth ${info.sunAzimuth.toFixed(0)}° ${info.sunCompass}  ·  ${info.panelCount} panel${info.panelCount === 1 ? '' : 's'}`
    : `Sun below the horizon (altitude ${info.sunAltitude.toFixed(0)}°)  ·  ${info.panelCount} panel${info.panelCount === 1 ? '' : 's'}`;
  ctx.font = `500 ${22 * k}px ${FONT}`;
  const tw = ctx.measureText(caption).width;
  const cw = tw + 48 * k;
  const ch = 52 * k;
  const cx = width - pad - cw;
  const cy = height - pad - ch;
  roundedRect(ctx, cx, cy, cw, ch, 12 * k);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.72)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, cx + 24 * k, cy + ch / 2 + 1 * k);

  // which building this close-up is framed on (only drawn on a multi-building design)
  if (info.buildingLabel) {
    ctx.font = `700 ${26 * k}px ${FONT}`;
    const bw = ctx.measureText(info.buildingLabel).width + 44 * k;
    const bh = 40 * k;
    const bx = width - pad - bw;
    const by = pad;
    roundedRect(ctx, bx, by, bw, bh, 10 * k);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.80)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(info.buildingLabel, bx + 22 * k, by + bh / 2 + 1 * k);
  }
}

/**
 * Create the report renderer next to the live one. It mirrors the live renderer's colour space, tone
 * mapping and shadow type so a render looks like the viewer, only larger. Falls back to a smaller
 * frame when the GPU cannot allocate the best size. Throws when WebGL is unavailable.
 * @param {THREE.WebGLRenderer} live
 */
export function createReportRenderer(live) {
  let lastError = null;
  for (const size of RENDER_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance', alpha: false });
      const gl = renderer.getContext();
      const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      if (gl.isContextLost() || renderer.capabilities.maxTextureSize < size.width || maxRb < size.width) throw new Error(`The graphics device cannot render ${size.width} × ${size.height} pixels.`);
      renderer.setPixelRatio(1);
      renderer.setSize(size.width, size.height, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = live?.shadowMap?.type ?? THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = live?.outputColorSpace ?? THREE.SRGBColorSpace;
      renderer.toneMapping = live?.toneMapping ?? THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = live?.toneMappingExposure ?? 1;
      const compose = document.createElement('canvas');
      compose.width = size.width;
      compose.height = size.height;
      const ctx = compose.getContext('2d');
      if (!ctx) throw new Error('2D canvas unavailable for the image overlay.');
      return {
        width: size.width,
        height: size.height,
        renderer,
        /**
         * Render the scene with `camera`, draw the overlay and return the picture as a JPEG data URL.
         * @param {THREE.Scene} scene
         * @param {THREE.Camera} camera
         * @param {OverlayInfo} overlay
         */
        capture(scene, camera, overlay) {
          renderer.render(scene, camera);
          if (renderer.getContext().isContextLost()) throw new Error('The graphics context was lost while rendering.');
          ctx.clearRect(0, 0, size.width, size.height);
          ctx.drawImage(canvas, 0, 0);
          drawOverlay(ctx, size.width, size.height, overlay);
          const data = compose.toDataURL('image/jpeg', IMAGE_QUALITY);
          if (!data || data.length < 20000) throw new Error('The rendered image is empty.');
          return { data, width: size.width, height: size.height };
        },
        dispose() {
          renderer.dispose();
          renderer.forceContextLoss?.();
          compose.width = compose.height = 0;
          canvas.width = canvas.height = 0;
        },
      };
    } catch (e) {
      lastError = e;
      try {
        renderer?.dispose();
        renderer?.forceContextLoss?.();
      } catch {
        /* nothing to clean */
      }
    }
  }
  throw new Error(`WebGL is unavailable, so the 3D renders for the report cannot be produced. ${lastError?.message || ''}`.trim());
}

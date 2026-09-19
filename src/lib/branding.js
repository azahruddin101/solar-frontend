'use client';

// Turns a company's branding (theme, logo, e-signature, QR) into what the PDF generator needs.
import { assetUrl } from './api.js';
import { hexToRgb, resolveTheme } from './theme.js';

/** Fetch an uploaded image and re-encode it as PNG (jsPDF-safe, whatever the source format). */
async function loadImage(path) {
  if (!path) return null;
  try {
    const blob = await (await fetch(assetUrl(path))).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } catch {
    return null; // a missing image must never block the proposal
  }
}

export async function loadBranding(company) {
  const branded = company?.features?.pdfBranding !== false;
  const theme = resolveTheme(branded ? company?.theme : null);
  const [logo, signature, qr] = branded ? await Promise.all([loadImage(company?.logo), loadImage(company?.signature), loadImage(company?.qr)]) : [null, null, null];
  return {
    branded,
    primary: hexToRgb(theme.primary),
    primaryFg: hexToRgb(theme.primaryFg),
    accent: hexToRgb(theme.accent),
    logo,
    signature,
    qr,
  };
}

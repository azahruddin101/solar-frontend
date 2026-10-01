// The proposal's public link and its QR code. The link holds an unguessable token, so anyone with it (or who scans the QR
// printed on the PDF) can open the proposal without signing in — and only that proposal.
import { api } from './api.js';

/** https://your-app/p/<token>. Set NEXT_PUBLIC_APP_URL when the public address differs from where the app is opened. */
export const publicUrl = (token) => `${(process.env.NEXT_PUBLIC_APP_URL || (typeof window === 'undefined' ? '' : window.location.origin)).replace(/\/+$/, '')}/p/${token}`;

/** The proposal's link, created the first time it is asked for. */
export async function ensureShareUrl(designId) {
  const { token } = await api(`/api/designs/${designId}/share`, { method: 'POST' });
  return publicUrl(token);
}

/** A QR code (PNG data URL) for `url`. Loaded on demand — the library is only needed when a PDF or the share dialog opens. */
export async function qrDataUrl(url, width = 480) {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}

/** { url, qr } for a PDF; null (no QR, nothing else affected) if the link could not be made. */
export async function shareForPdf(designId) {
  if (!designId) return null;
  try {
    const url = await ensureShareUrl(designId);
    return { url, qr: await qrDataUrl(url) };
  } catch {
    return null;
  }
}

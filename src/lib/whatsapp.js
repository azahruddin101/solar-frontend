'use client';

/** Normalise a stored client phone to digits for https://wa.me/ (default: Indian +91). */
export function whatsAppPhoneDigits(phone) {
  let p = String(phone ?? '').replace(/[\s().+-]/g, '');
  if (p.length === 12 && p.startsWith('91')) return p;
  if (p.length === 11 && p.startsWith('0')) p = p.slice(1);
  if (p.length === 10 && /^[6-9]/.test(p)) return `91${p}`;
  if (p.length >= 10 && p.length <= 15 && /^\d+$/.test(p)) return p;
  return null;
}

/** Open WhatsApp to the client with a message that includes the PDF link (S3-backed file served at /uploads). */
export function shareLinkOnWhatsApp({ phone, pdfUrl, message }) {
  const digits = whatsAppPhoneDigits(phone);
  if (!digits) throw new Error('Add a valid 10-digit mobile number for this client first.');
  if (!pdfUrl) throw new Error('PDF link is not available yet.');

  const text = message ? `${message}\n\n${pdfUrl}` : pdfUrl;
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}

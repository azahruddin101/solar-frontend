'use client';

// Shared pieces of the company's letterhead-style documents (profit & loss, …): logo and contact block, section
// labels, party blocks and the page footer. Invoices, bills and e-way bills use the grid layout in gridPdf.js instead.
import { formatMoney } from './energy.js';
import { pdfKit } from './pdf.js';
import { amountInWords, amountInWordsInr, fmtPdfDate, PAYMENT_MODE_LABEL } from './billingPdfShared.js';

const { text, clip, wrap, logoOrName } = pdfKit;
const { W, H, M, CW } = pdfKit.pageSize;
const { INK, BODY, MUTED, LINE } = pdfKit.colors;

export { amountInWords, amountInWordsInr, PAYMENT_MODE_LABEL };

const fmtDate = fmtPdfDate;

function context(company, client, currency) {
  return { company: { name: 'Company', ...company }, client: client || {}, money: (v) => formatMoney(v, currency, { pdf: true, decimals: 2 }), currency };
}

/**
 * Letterhead: logo / name and contact on the left, document title and number (or a `subtitle` instead) on the right.
 * Returns the next y.
 */
function letterhead(doc, brand, company, { title, no, subtitle, date, dateLabel = 'Date' }) {
  logoOrName(doc, { brand, company }, M, 12, 52, 14, 15);
  const contact = [company.address, [company.phone, company.email].filter(Boolean).join('  |  '), company.website, company.taxId && `GSTIN: ${company.taxId}`].filter(Boolean);
  let y = 32;
  for (const l of contact) {
    const lines = wrap(doc, l, 100, 8.5);
    text(doc, lines.slice(0, 2), M, y, { size: 8.5, color: MUTED, lineHeight: 1.3 });
    y += Math.min(lines.length, 2) * 4;
  }
  text(doc, title, W - M, 18, { size: 20, style: 'bold', color: INK, align: 'right' });
  const sub = subtitle ? clip(doc, subtitle, 92, 10, 'bold') : `No. ${no}`;
  text(doc, sub, W - M, 26, { size: 10, style: 'bold', color: brand.primary, align: 'right' });
  text(doc, `${dateLabel}: ${fmtDate(date)}`, W - M, 31.5, { size: 9, color: BODY, align: 'right' });
  y = Math.max(y, 40) + 3;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  doc.setFillColor(...brand.primary);
  doc.rect(M, y - 0.4, 22, 0.9, 'F');
  return y + 9;
}

function label(doc, str, x, y, brand) {
  text(doc, str.toUpperCase(), x, y, { size: 7.5, style: 'bold', color: brand.primary });
}

/** A block of lines under a small caps label; returns the y below it. */
function party(doc, brand, x, y, w, heading, name, rows) {
  label(doc, heading, x, y, brand);
  text(doc, clip(doc, name || '-', w, 11.5, 'bold'), x, y + 6, { size: 11.5, style: 'bold', color: INK });
  let yy = y + 11.5;
  for (const row of rows.filter(Boolean)) {
    const lines = wrap(doc, row, w, 9).slice(0, 3);
    text(doc, lines, x, yy, { size: 9, color: BODY, lineHeight: 1.3 });
    yy += lines.length * 4.4;
  }
  return yy;
}

function pageFooter(doc, company, brand) {
  const pages = doc.getNumberOfPages();
  const contact = [company.name, company.phone, company.email].filter(Boolean).join('   |   ');
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, H - 14, W - M, H - 14);
    text(doc, clip(doc, contact, CW - 30, 7.5), M, H - 9, { size: 7.5, color: MUTED });
    if (pages > 1) text(doc, `${i} / ${pages}`, W - M, H - 9, { size: 7.5, style: 'bold', color: INK, align: 'right' });
  }
}

/** The letterhead, section labels and footer, for other company documents in the same style (e.g. lib/pnlPdf.js). */
export const documentParts = { context, letterhead, label, party, pageFooter };

export { invoiceTax } from './pricing.js';
export { buildInvoicePdfBlob, downloadBlob, generateInvoicePdf } from './invoicePdf.js';

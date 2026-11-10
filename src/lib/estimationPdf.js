'use client';

// The estimate as an A4 PDF, drawn in the browser and downloaded straight away — never uploaded or stored.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { documentParts } from './billingPdf.js';
import { amountInWords, fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { loadBranding } from './branding.js';
import { estimateTotals } from './estimation.js';
import { downloadBlob } from './invoicePdf.js';
import { pdfKit } from './pdf.js';
import { currentTax } from './tax.js';

const { text, clip, wrap } = pdfKit;
const { W, H, M, CW } = pdfKit.pageSize;
const { INK, BODY, LINE, SOFT } = pdfKit.colors;
const { context, letterhead, label, party, pageFooter } = documentParts;
const FOOTER_SPACE = 22;

/** `estimate`: { client: {name, phone, email, address}, date, withGst, lines, notes } */
export async function buildEstimatePdfBlob({ estimate, company = {}, currency = 'INR' }) {
  const { client = {}, withGst, lines = [], notes = '' } = estimate;
  const date = estimate.date ? new Date(`${estimate.date}T12:00:00`) : new Date();
  const brand = await loadBranding(company);
  const { company: co, money } = context(company, client, currency);
  const t = estimateTotals(lines, withGst);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Estimate${client.name ? ` — ${client.name}` : ''}`, author: co.name, subject: 'Price estimate', creator: co.name });

  let y = letterhead(doc, brand, co, { title: 'ESTIMATE', subtitle: withGst ? `Including ${currentTax().label}` : `Without ${currentTax().label}`, date });

  const half = (CW - 10) / 2;
  const a = party(doc, brand, M, y, half, 'Estimate for', client.name || '-', [client.phone && `Phone: ${client.phone}`, client.email, client.address]);
  const b = party(doc, brand, M + half + 10, y, half, 'Summary', money(t.total), [`${t.rows.length} item${t.rows.length === 1 ? '' : 's'}`, withGst ? `Includes ${currentTax().label} of ${money(t.gstTotal)}` : `Prices without ${currentTax().label}`]);
  y = Math.max(a, b) + 6;

  label(doc, 'Items', M, y, brand);
  const head = ['#', 'Description', 'Qty', 'Rate', ...(withGst ? [currentTax().label] : []), 'Amount'];
  const right = withGst ? [2, 3, 4, 5] : [2, 3, 4];
  autoTable(doc, {
    startY: y + 3,
    theme: 'plain',
    margin: { left: M, right: M, top: 20, bottom: FOOTER_SPACE },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
    headStyles: { fillColor: brand.primary, textColor: brand.primaryFg, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: [252, 252, 253] },
    showHead: 'everyPage',
    head: [head],
    body: t.rows.map((r, i) => [
      String(i + 1),
      [r.name, r.detail, r.hsn && `HSN/SAC: ${r.hsn}`].filter(Boolean).join('\n'),
      `${r.qty} ${r.unit || ''}`.trim(),
      money(r.rate),
      ...(withGst ? [`${r.gstRate}%`] : []),
      money(withGst ? r.total : r.amount),
    ]),
    columnStyles: { 0: { cellWidth: 11, halign: 'center', cellPadding: { top: 2.4, bottom: 2.4, left: 1, right: 1 } }, 2: { cellWidth: 22 }, ...(withGst ? { 4: { cellWidth: 14 } } : {}) },
    didParseCell: (d) => {
      if (right.includes(d.column.index)) d.cell.styles.halign = 'right';
    },
  });
  y = doc.lastAutoTable.finalY + 8;

  // totals, right-aligned block
  const rowsOut = [['Subtotal', money(t.subtotal)], ...(withGst ? t.gstGroups.map((g) => [`${currentTax().label} @ ${g.rate}%`, money(g.gst)]) : [])];
  y = needRoom(doc, y, rowsOut.length * 6 + 24);
  const lx = W - M - 80;
  for (const [k, v] of rowsOut) {
    text(doc, k, lx, y, { size: 9.5, color: BODY });
    text(doc, v, W - M, y, { size: 9.5, color: INK, align: 'right' });
    y += 6;
  }
  doc.setFillColor(...SOFT);
  doc.roundedRect(lx - 3, y - 4, 83, 10, 1.6, 1.6, 'F');
  text(doc, 'Total', lx, y + 2.2, { size: 11, style: 'bold', color: INK });
  text(doc, money(t.total), W - M - 1, y + 2.2, { size: 11, style: 'bold', color: brand.primary, align: 'right' });
  y += 14;

  const words = amountInWords(t.total, currency);
  if (words) {
    y = needRoom(doc, y, 10);
    const lines2 = wrap(doc, `Amount in words: ${words}`, CW, 8.5, 'bold');
    text(doc, lines2, M, y, { size: 8.5, style: 'bold', color: INK });
    y += lines2.length * 4.2 + 4;
  }
  if (notes.trim()) {
    const body = wrap(doc, notes.trim(), CW, 8.5);
    y = needRoom(doc, y, 8 + body.length * 4);
    label(doc, 'Notes', M, y, brand);
    text(doc, body, M, y + 5, { size: 8.5, color: BODY, lineHeight: 1.3 });
    y += 8 + body.length * 4;
  }
  y = needRoom(doc, y, 8);
  text(doc, 'This is an estimate for your reference, not a tax invoice. Final prices may change.', M, y, { size: 7.5, color: [100, 116, 139] });

  pageFooter(doc, co, brand);
  for (let i = 1; i <= doc.getNumberOfPages(); i += 1) {
    doc.setPage(i);
    doc.setFillColor(...brand.primary);
    doc.rect(0, 0, W, 2.2, 'F');
    if (i > 1) text(doc, clip(doc, `Estimate${client.name ? ` — ${client.name}` : ''}`, CW - 40, 8, 'bold'), M, 12, { size: 8, style: 'bold', color: [100, 116, 139] });
  }

  const filename = `${['estimate', pdfSlug(client.name) || 'client', date.toISOString().slice(0, 10)].join('_')}.pdf`;
  return { blob: doc.output('blob'), filename, date: fmtPdfDate(date) };
}

function needRoom(doc, y, h) {
  if (y + h <= H - FOOTER_SPACE) return y;
  doc.addPage();
  return 20;
}

export async function downloadEstimatePdf(params) {
  const { blob, filename } = await buildEstimatePdfBlob(params);
  downloadBlob(blob, filename);
}

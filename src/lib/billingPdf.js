'use client';

// Payment receipts and tax invoices: A4, branded with the company's logo, colours and signature.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from './branding.js';
import { formatMoney } from './energy.js';
import { pdfKit } from './pdf.js';
import { amountInWords, amountInWordsInr, fmtPdfDate, PAYMENT_MODE_LABEL, pdfSlug } from './billingPdfShared.js';

const { text, clip, wrap, tableStyle, placeImage, logoOrName } = pdfKit;
const { W, H, M, CW } = pdfKit.pageSize;
const { INK, BODY, MUTED, LINE, SOFT } = pdfKit.colors;

export { amountInWords, amountInWordsInr, PAYMENT_MODE_LABEL };

const fmtDate = fmtPdfDate;

/* ───────────── shared pieces ───────────── */

function context(company, client, currency) {
  return { company: { name: 'Company', ...company }, client: client || {}, money: (v) => formatMoney(v, currency, { pdf: true, decimals: 2 }), currency };
}

/** Letterhead: logo / name and contact on the left, document title and number on the right. Returns the next y. */
function letterhead(doc, brand, company, { title, no, date }) {
  logoOrName(doc, { brand, company }, M, 12, 52, 14, 15);
  const contact = [company.address, [company.phone, company.email].filter(Boolean).join('  |  '), company.website, company.taxId && `GSTIN: ${company.taxId}`].filter(Boolean);
  let y = 32;
  for (const l of contact) {
    const lines = wrap(doc, l, 100, 8.5);
    text(doc, lines.slice(0, 2), M, y, { size: 8.5, color: MUTED, lineHeight: 1.3 });
    y += Math.min(lines.length, 2) * 4;
  }
  text(doc, title, W - M, 18, { size: 20, style: 'bold', color: INK, align: 'right' });
  text(doc, `No. ${no}`, W - M, 26, { size: 10, style: 'bold', color: brand.primary, align: 'right' });
  text(doc, `Date: ${fmtDate(date)}`, W - M, 31.5, { size: 9, color: BODY, align: 'right' });
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

/** Company signature block on the right. */
function signature(doc, brand, company, y, caption = 'Authorised signatory') {
  const w = 62;
  const x = W - M - w;
  text(doc, `For ${company.name}`, x + w, y, { size: 8.5, style: 'bold', color: INK, align: 'right' });
  if (brand.signature) placeImage(doc, brand.signature, x, y + 3, w, 17, 'right');
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.25);
  doc.line(x, y + 23, x + w, y + 23);
  text(doc, company.signatoryName || caption, x + w, y + 28, { size: 9, style: 'bold', color: INK, align: 'right' });
  text(doc, company.signatoryTitle || caption, x + w, y + 32.5, { size: 7.5, color: MUTED, align: 'right' });
  return y + 36;
}

/** Two-column label / value rows with hairlines. */
function detailRows(doc, x, y, w, rows) {
  const rowH = 8;
  rows.filter(([, v]) => v).forEach(([k, v], i) => {
    const yy = y + i * rowH;
    text(doc, k, x, yy + 5.2, { size: 8.5, color: MUTED });
    text(doc, clip(doc, v, w * 0.62, 9, 'bold'), x + w, yy + 5.2, { size: 9, style: 'bold', color: INK, align: 'right' });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(x, yy + rowH, x + w, yy + rowH);
  });
  return y + rows.filter(([, v]) => v).length * rowH;
}

const slug = pdfSlug;

/* ───────────── receipt ───────────── */

/**
 * `payment` is the receipt, `ledger` the proposal's billing state after it ({ total, ... }),
 * `history` every receipt for the proposal up to and including this one.
 */
export async function generateReceiptPdf({ payment, proposalName, total, history = [], company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = context(company, client, currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Receipt ${payment.receiptNo}`, author: co.name, subject: `Payment receipt for ${cl.name || 'client'}`, creator: co.name });

  let y = letterhead(doc, brand, co, { title: 'PAYMENT RECEIPT', no: payment.receiptNo, date: payment.receivedOn });

  // received from / against
  const half = (CW - 10) / 2;
  const a = party(doc, brand, M, y, half, 'Received from', cl.name, [cl.address, cl.phone, cl.email]);
  const b = party(doc, brand, M + half + 10, y, half, 'Towards', proposalName, [`Proposal total: ${money(total)}`]);
  y = Math.max(a, b) + 6;

  // amount received
  const boxH = 30;
  doc.setFillColor(...SOFT);
  doc.rect(M, y, CW, boxH, 'F');
  doc.setFillColor(...brand.primary);
  doc.rect(M, y, 1.6, boxH, 'F');
  label(doc, 'Amount received', M + 8, y + 8, brand);
  text(doc, money(payment.amount), M + 8, y + 19, { size: 22, style: 'bold', color: INK });
  const words = amountInWords(payment.amount, currency);
  if (words) text(doc, clip(doc, words, CW - 16, 8.5), M + 8, y + 26, { size: 8.5, color: BODY });
  y += boxH + 10;

  // payment details
  label(doc, 'Payment details', M, y, brand);
  const dw = (CW - 12) / 2;
  const yA = detailRows(doc, M, y + 3, dw, [
    ['Receipt no.', payment.receiptNo],
    ['Payment date', fmtDate(payment.receivedOn)],
    ['Payment mode', PAYMENT_MODE_LABEL[payment.mode] || payment.mode],
    ['Reference / Txn no.', payment.reference],
  ]);
  label(doc, 'Payment summary', M + dw + 12, y, brand);
  const previous = Math.round((payment.contractTotal - payment.balanceAfter - payment.amount) * 100) / 100;
  const yB = detailRows(doc, M + dw + 12, y + 3, dw, [
    ['Proposal total', money(payment.contractTotal || total)],
    ['Received earlier', money(previous)],
    ['Received now', money(payment.amount)],
  ]);
  y = Math.max(yA, yB) + 4;

  // balance
  const settled = payment.balanceAfter <= 0.001;
  doc.setFillColor(...brand.primary);
  doc.rect(M, y, CW, 13, 'F');
  text(doc, settled ? 'PAID IN FULL' : 'BALANCE DUE', M + 5, y + 8.3, { size: 9, style: 'bold', color: brand.primaryFg });
  text(doc, settled ? `${money(0)}  -  the invoice can now be issued` : money(payment.balanceAfter), W - M - 5, y + 8.7, { size: settled ? 9 : 13, style: 'bold', color: brand.primaryFg, align: 'right' });
  y += 13 + 10;

  if (payment.note) {
    label(doc, 'Note', M, y, brand);
    const lines = wrap(doc, payment.note, CW, 9);
    text(doc, lines.slice(0, 4), M, y + 5.5, { size: 9, color: BODY, lineHeight: 1.35 });
    y += 5.5 + Math.min(lines.length, 4) * 4.6 + 6;
  }

  // history
  if (history.length > 1) {
    label(doc, 'Payments received for this proposal', M, y, brand);
    autoTable(doc, {
      ...tableStyle(doc, { brand, pageTitle: '' }),
      startY: y + 3,
      margin: { left: M, right: M },
      didDrawPage: () => {},
      head: [['Receipt', 'Date', 'Mode', 'Reference', 'Amount']],
      body: history.map((p) => [p.receiptNo, fmtDate(p.receivedOn), PAYMENT_MODE_LABEL[p.mode]?.split(' (')[0] || p.mode, p.reference || '-', money(p.amount)]),
      columnStyles: { 4: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index === 4) d.cell.styles.halign = 'right';
        if (d.section === 'body' && d.row.raw[0] === payment.receiptNo) d.cell.styles.fontStyle = 'bold';
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  y = Math.max(y, H - 78);
  signature(doc, brand, co, y);
  text(doc, 'This is a computer-generated receipt. Thank you for your payment.', M, y + 30, { size: 8, color: MUTED });

  pageFooter(doc, co, brand);
  doc.save(`${['receipt', payment.receiptNo, slug(cl.name)].filter(Boolean).join('_')}.pdf`);
}

export { invoiceTax } from './pricing.js';
export { buildInvoicePdfBlob, generateInvoicePdf } from './invoicePdf.js';

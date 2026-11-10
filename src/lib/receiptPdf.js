'use client';

// The receipt: money received from a client — the amount (in figures and words), the date, how it was paid, who took
// it and, when one was given, the reason. Same grid layout as the bill (gridPdf.js).
import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { stateFromGstin } from './pricing.js';
import { PAYMENT_MODE_LABEL, fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { IM, IW, baseTable, ctx, finishDocument, moneyFormats, partyMetaTable, signatureStrip, titleBar } from './gridPdf.js';

const LABEL = { fontStyle: 'bold', fillColor: [252, 252, 253] };

/** Build the receipt PDF bytes. `receipt` is a Payment row; `client` the client record (or the row's bill-to copy). */
export async function buildReceiptPdfBlob({ receipt, company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = ctx(company, client?.name ? client : receipt.billTo || {}, currency);
  const { rs, words } = moneyFormats(currency, money);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Receipt ${receipt.receiptNo}`, author: co.name, subject: `Receipt for ${cl.name || 'client'}`, creator: co.name });

  const amount = Number(receipt.amount) || 0;
  const receivedBy = receipt.receivedByName || receipt.createdByName || '';
  const reason = String(receipt.reason || receipt.note || '').trim();
  const mode = PAYMENT_MODE_LABEL[receipt.mode] || receipt.mode || '';

  let y = titleBar(doc, brand, IM, 'RECEIPT');
  y = partyMetaTable(doc, brand, {
    y,
    co,
    cl,
    coState: stateFromGstin(co.taxId),
    clState: stateFromGstin(cl.gstNumber),
    metaRows: [
      ['Receipt No.', receipt.receiptNo],
      ['Dated', fmtPdfDate(receipt.receivedOn)],
      ['Reference', receipt.title || '—'],
      ['Received by', receivedBy || '—'],
    ],
    buyerLabel: 'Received from',
  });

  const rows = [
    ['Received with thanks from', cl.billingName || cl.name || '—'],
    ['The sum of', `${rs(amount)}\n${words(amount)}`],
    ['Paid by', [mode, receipt.reference && `Ref: ${receipt.reference}`].filter(Boolean).join('  ·  ') || '—'],
    ...(reason ? [['Reason', reason]] : []),
  ];
  // what was billed and what is left: only when something was billed and money is still due
  const billed = Number(receipt.contractTotal) || 0;
  const balance = Number(receipt.balanceAfter) || 0;
  if (!receipt.bill && billed > 0 && balance > 0.005) rows.push(['Balance after this receipt', rs(balance)]);
  y = baseTable(doc, brand, {
    startY: y,
    body: rows.map(([label, value], i) => [{ content: label, styles: LABEL }, { content: value, styles: i === 1 ? { fontStyle: 'bold', fontSize: 9.5 } : {} }]),
    columnStyles: { 0: { cellWidth: IW * 0.3 }, 1: { cellWidth: IW * 0.7 } },
    styles: { fontSize: 8.5, cellPadding: 3, valign: 'middle' },
  });

  signatureStrip(doc, brand, {
    y,
    co,
    declaration: `Amount received\n${rs(amount)}\n\nCheques are subject to realisation.`,
    middle: `Received by\n${receivedBy || '-'}\n\n\nSignature`,
  });

  finishDocument(doc, co, brand, 'This is a Computer Generated Receipt');
  const filename = `${['receipt', receipt.receiptNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

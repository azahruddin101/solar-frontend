'use client';

// The credit note: goods that came back on a paid bill, priced from the bill (GST and discount share included) and
// refunded. Same grid layout as the bill and the tax invoice (gridPdf.js).
import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { gstSupplyType, invoiceTax, stateFromGstin } from './pricing.js';
import { PAYMENT_MODE_LABEL, fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { IM, IW, baseTable, ctx, ensurePage, finishDocument, goodsTable, moneyFormats, partyMetaTable, signatureStrip, taxSummary, termsBlock, titleBar, wordsRow } from './gridPdf.js';

/** Build the credit note PDF. `billNo` is the bill it is against (the note's populated `bill` carries it too). */
export async function buildCreditNotePdfBlob({ note, billNo = '', company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = ctx(company, client, currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Credit note ${note.creditNo}`, author: co.name, subject: `Credit note for ${cl.name || 'client'}`, creator: co.name });

  const pricing = note.pricing || {};
  const withGst = pricing.withGst !== false && pricing.invoiceGstMode !== 'without_gst';
  const lines = (pricing.lines || []).filter((l) => l?.name).map((l) => ({
    ...l,
    detail: [l.batchNo ? `Batch ${l.batchNo}` : '', l.serials?.length ? `Serial: ${l.serials.join(', ')}` : ''].filter(Boolean).join(' · '),
  }));
  const total = Number(pricing.total ?? note.total) || 0;
  const tax = invoiceTax(pricing, total);
  const supply = gstSupplyType(co.taxId, cl.gstNumber);
  const useIgst = withGst && supply === 'igst';
  const { amt, rs, words } = moneyFormats(currency, money);
  const refund = note.refund || {};
  const against = billNo || note.bill?.billNo || '';

  let y = titleBar(doc, brand, IM, withGst ? 'TAX CREDIT NOTE' : 'CREDIT NOTE', 'Refunded');
  const metaRows = [
    ['Credit Note No.', note.creditNo],
    ['Dated', fmtPdfDate(note.issuedOn)],
    ['Against Bill', against || '—'],
    ['Reference', note.title || '—'],
    ['Reason', note.reason || '—'],
    ['Refunded by', [PAYMENT_MODE_LABEL[refund.mode] || refund.mode, refund.reference].filter(Boolean).join(' · ') || '—'],
    ['Refunded on', refund.refundedOn ? fmtPdfDate(refund.refundedOn) : fmtPdfDate(note.issuedOn)],
  ];
  if (withGst && supply) metaRows.push(['Supply type', supply === 'igst' ? 'Inter-state (IGST)' : 'Intra-state (CGST/SGST)']);
  y = partyMetaTable(doc, brand, { y, co, cl, coState: stateFromGstin(co.taxId), clState: stateFromGstin(cl.gstNumber), metaRows });

  const extraRows = pricing.discountAmount > 0 ? [['Discount reversed', `-${amt(pricing.discountAmount)}`]] : [];
  y = goodsTable(doc, brand, { y, groups: [{ lines }], withGst, amt, rs, extraRows, tax, useIgst, total, descriptionHead: 'Description of Goods Returned' });
  y = wordsRow(doc, brand, y, 'Amount Refunded (in words)', words(total));
  if (withGst) y = taxSummary(doc, brand, { y, tax, useIgst, amt, currency });

  y = ensurePage(doc, y, 14);
  y = baseTable(doc, brand, {
    startY: y,
    body: [[{ content: `REFUNDED — ${rs(total)} paid back by ${PAYMENT_MODE_LABEL[refund.mode] || refund.mode || 'cash'}${refund.reference ? ` (${refund.reference})` : ''} on ${fmtPdfDate(refund.refundedOn || note.issuedOn)}${refund.note ? `. ${refund.note}` : ''}`, styles: { fontStyle: 'bold', fillColor: brand.primary, textColor: brand.primaryFg, cellPadding: 2.5 } }]],
    columnStyles: { 0: { cellWidth: IW } },
  });

  y = signatureStrip(doc, brand, { y, co, declaration: 'Declaration\nThe goods described above were received back from the client and the amount shown has been refunded. This credit note is against the bill shown, which otherwise stands.' });
  termsBlock(doc, brand, y, co.pdfTerms);

  finishDocument(doc, co, brand, 'This is a Computer Generated Credit Note');
  const filename = `${['credit-note', note.creditNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

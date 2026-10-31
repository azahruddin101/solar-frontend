'use client';

// The bill: goods from one or more e-way bills plus services, with GST and an optional discount — paid in full when it
// is made, so it doubles as the receipt. Same grid layout as the tax invoice (gridPdf.js).
import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { gstSupplyType, invoiceTax, stateFromGstin } from './pricing.js';
import { PAYMENT_MODE_LABEL, fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { IM, IW, baseTable, ctx, ensurePage, finishDocument, goodsTable, moneyFormats, partyMetaTable, signatureStrip, taxSummary, termsBlock, titleBar, wordsRow } from './gridPdf.js';

/** Build the bill PDF bytes. `client` is the client record (or the bill's bill-to copy). */
export async function buildBillPdfBlob({ bill, company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = ctx(company, client, currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Bill ${bill.billNo}`, author: co.name, subject: `Bill for ${cl.name || 'client'}`, creator: co.name });

  const pricing = bill.pricing || {};
  const withGst = pricing.withGst !== false && pricing.invoiceGstMode !== 'without_gst';
  // one plain table: goods in e-way bill order, then services; a service whose description repeats its name prints once
  const lines = (pricing.lines || []).filter((l) => l?.name).map((l) => ({
    ...l,
    detail: [l.batchNo ? `Batch ${l.batchNo}` : '', String(l.detail || '').trim() === String(l.name || '').trim() ? '' : l.detail].filter(Boolean).join(' · '),
  }));
  const total = Number(pricing.total ?? bill.total) || 0;
  const tax = invoiceTax(pricing, total);
  const supply = gstSupplyType(co.taxId, cl.gstNumber);
  const useIgst = withGst && supply === 'igst';
  const { amt, rs, words } = moneyFormats(currency, money);
  const fmtDate = fmtPdfDate;
  const paid = bill.paid || {};
  const ewayBills = Array.isArray(bill.ewayBills) ? bill.ewayBills.filter((e) => e && typeof e === 'object') : [];

  let y = titleBar(doc, brand, IM, withGst ? 'TAX BILL' : 'BILL', 'Paid');
  const metaRows = [
    ['Bill No.', bill.billNo],
    ['Dated', fmtDate(bill.issuedOn)],
    ['Reference', bill.title || '—'],
    ['E-way Bills', ewayBills.length ? ewayBills.map((e) => e.ewayNo).join(', ') : '—'],
    ['Paid by', [PAYMENT_MODE_LABEL[paid.mode] || paid.mode, paid.reference].filter(Boolean).join(' · ') || '—'],
    ['Paid on', paid.receivedOn ? fmtDate(paid.receivedOn) : fmtDate(bill.issuedOn)],
  ];
  if (bill.invoice?.invoiceNo) metaRows.push(['Invoice', bill.invoice.invoiceNo]);
  if (withGst && supply) metaRows.push(['Supply type', supply === 'igst' ? 'Inter-state (IGST)' : 'Intra-state (CGST/SGST)']);
  y = partyMetaTable(doc, brand, { y, co, cl, coState: stateFromGstin(co.taxId), clState: stateFromGstin(cl.gstNumber), metaRows });

  const groups = [{ lines }];

  const extraRows = pricing.discountAmount > 0 ? [[pricing.discountRemark ? `Discount\n${pricing.discountRemark}` : 'Discount', `-${amt(pricing.discountAmount)}`]] : [];
  y = goodsTable(doc, brand, { y, groups, withGst, amt, rs, extraRows, tax, useIgst, total, descriptionHead: 'Description of Goods / Services' });
  y = wordsRow(doc, brand, y, 'Amount Received (in words)', words(total));
  if (withGst) y = taxSummary(doc, brand, { y, tax, useIgst, amt, currency });

  // the receipt strip
  y = ensurePage(doc, y, 14);
  y = baseTable(doc, brand, {
    startY: y,
    body: [[{ content: `PAID IN FULL — ${rs(total)} received by ${PAYMENT_MODE_LABEL[paid.mode] || paid.mode || 'cash'}${paid.reference ? ` (${paid.reference})` : ''} on ${fmtDate(paid.receivedOn || bill.issuedOn)}${paid.note ? `. ${paid.note}` : ''}`, styles: { fontStyle: 'bold', fillColor: brand.primary, textColor: brand.primaryFg, cellPadding: 2.5 } }]],
    columnStyles: { 0: { cellWidth: IW } },
  });

  y = signatureStrip(doc, brand, { y, co, declaration: 'Declaration\nWe declare that this bill shows the actual price of the goods and services described and that the amount above has been received in full.' });
  termsBlock(doc, brand, y, co.pdfTerms);

  finishDocument(doc, co, brand, 'This is a Computer Generated Bill');
  const filename = `${['bill', bill.billNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

'use client';

// The two documents made when a bill is generated, both from the same saved bill:
//  - the BILL: every material and service with its price, the tax and the total;
//  - the DELIVERY CHALLAN: the materials and their quantities with the delivery details, and no prices.
// Same grid layout as the tax invoice (gridPdf.js).
import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { gstSupplyType, invoiceTax, stateFromGstin } from './pricing.js';
import { PAYMENT_MODE_LABEL, fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { IM, IW, baseTable, ctx, detailGrid, finishDocument, goodsTable, lineDescription, moneyFormats, partyMetaTable, signatureStrip, taxSummary, titleBar, wordsRow } from './gridPdf.js';

export const TRANSPORT_MODE_LABEL = { road: 'Road', rail: 'Rail', air: 'Air', ship: 'Ship' };
export const TRANSPORT_REASON_LABEL = { supply: 'Supply', job_work: 'Job work', own_use: 'Own use', exhibition: 'Exhibition or fairs', others: 'Others' };

/** The transport rows that were filled in, as [label, value]. */
export function transportRows(t = {}, fmtDate = fmtPdfDate) {
  return [
    ['Mode', TRANSPORT_MODE_LABEL[t.mode] || t.mode],
    ['Vehicle No.', t.vehicleNo],
    ['Transporter', [t.transporter, t.transporterId].filter(Boolean).join(' · ')],
    ['Transport Doc', [t.docNo, t.docDate ? fmtDate(t.docDate) : ''].filter(Boolean).join(' · ')],
    ['Dispatch From', t.fromPlace],
    ['Deliver To', t.toPlace],
    ['Distance', t.distanceKm != null && t.distanceKm !== '' ? `${t.distanceKm} km` : ''],
    ['Reason', TRANSPORT_REASON_LABEL[t.reason] || t.reason],
  ].filter(([, v]) => String(v ?? '').trim());
}

/**
 * The challan number of a bill: the same running number, so the two documents are found together (BILL-0007 →
 * DC-0007; bills from before the rename, EWB-0003 → DC-0003 — one counter numbered both, so they never clash).
 */
export const challanNoOf = (ewayNo) => `DC-${String(ewayNo || '').replace(/^[A-Za-z]+-/, '')}`;

/** The materials on a bill (its service lines are not delivered, so they are not on the challan). */
export const challanLines = (ewayBill) => (ewayBill?.pricing?.lines || ewayBill?.lines || []).filter((l) => l?.name && l.kind !== 'service');

/** A bill has a challan when it carries at least one material. */
export const hasChallan = (ewayBill) => challanLines(ewayBill).length > 0;

/** Build the bill PDF bytes. `client` is the client record. */
export async function buildEwayBillPdfBlob({ ewayBill, company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = ctx(company, client, currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Bill ${ewayBill.ewayNo}`, author: co.name, subject: `Bill for ${cl.name || 'client'}`, creator: co.name });

  const pricing = ewayBill.pricing || {};
  const withGst = pricing.withGst !== false && pricing.invoiceGstMode !== 'without_gst';
  const lines = (pricing.lines || ewayBill.lines || []).filter((l) => l?.name).map((l) => ({ ...l, detail: [l.batchNo ? `Batch ${l.batchNo}` : '', l.detail].filter(Boolean).join(' · ') }));
  const hasServices = lines.some((l) => l.kind === 'service');
  const hasGoods = lines.some((l) => l.kind !== 'service');
  const descHead = hasServices && hasGoods ? 'Description of goods & services' : hasServices ? 'Description of services' : 'Description of Goods';
  const total = Number(pricing.total ?? ewayBill.total) || 0;
  const tax = invoiceTax(pricing, total);
  const supply = gstSupplyType(co.taxId, cl.gstNumber);
  const useIgst = withGst && supply === 'igst';
  const { amt, rs, words } = moneyFormats(currency, money);
  const fmtDate = fmtPdfDate;

  let y = titleBar(doc, brand, IM, 'BILL');
  const metaRows = [
    ['Bill No.', ewayBill.ewayNo],
    ['Dated', fmtDate(ewayBill.issuedOn)],
    ['Reference', ewayBill.title || '—'],
  ];
  if (hasGoods) metaRows.push(['Delivery Challan', challanNoOf(ewayBill.ewayNo)]);
  if (ewayBill.paid?.settled && ewayBill.status !== 'cancelled') metaRows.push(['Payment', ['Paid', PAYMENT_MODE_LABEL[ewayBill.paid.mode]?.split(' (')[0], ewayBill.paid.reference].filter(Boolean).join(' · ')]);
  if (ewayBill.status === 'cancelled') metaRows.push(['Status', `Cancelled${ewayBill.cancelReason ? ` — ${ewayBill.cancelReason}` : ''}`]);
  y = partyMetaTable(doc, brand, { y, co, cl, coState: stateFromGstin(co.taxId), clState: stateFromGstin(cl.gstNumber), metaRows, buyerLabel: 'Bill to' });

  y = goodsTable(doc, brand, { y, groups: [{ lines }], withGst, amt, rs, tax, useIgst, total, descriptionHead: descHead });
  y = wordsRow(doc, brand, y, 'Bill total (in words)', words(total));
  if (withGst) y = taxSummary(doc, brand, { y, tax, useIgst, amt, currency });

  y = signatureStrip(doc, brand, {
    y,
    co,
    declaration: 'Declaration\nWe declare that this bill shows the actual price of the goods and services described and that all particulars are true and correct.',
    middle: `Customer's signature & date${ewayBill.note ? `\n\nNote: ${ewayBill.note}` : ''}`,
  });

  finishDocument(doc, co, brand, 'This is a Computer Generated Document');
  const filename = `${['bill', ewayBill.ewayNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

/**
 * Build the delivery challan PDF bytes of a bill: its materials and quantities (with batch and serial numbers) and
 * the delivery details typed on the bill — no prices. `client` is the consignee (the client record).
 */
export async function buildChallanPdfBlob({ ewayBill, company = {}, client = {}, currency = 'INR' }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl } = ctx(company, client, currency);
  const challanNo = challanNoOf(ewayBill.ewayNo);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Delivery challan ${challanNo}`, author: co.name, subject: `Delivery challan for ${cl.name || 'client'}`, creator: co.name });
  const fmtDate = fmtPdfDate;
  const lines = challanLines(ewayBill).map((l) => ({ ...l, detail: [l.batchNo ? `Batch ${l.batchNo}` : '', l.detail].filter(Boolean).join(' · ') }));

  let y = titleBar(doc, brand, IM, 'DELIVERY CHALLAN');
  const metaRows = [
    ['Challan No.', challanNo],
    ['Dated', fmtDate(ewayBill.issuedOn)],
    ['Bill No.', ewayBill.ewayNo],
    ['Reference', ewayBill.title || '—'],
  ];
  if (ewayBill.status === 'cancelled') metaRows.push(['Status', `Cancelled${ewayBill.cancelReason ? ` — ${ewayBill.cancelReason}` : ''}`]);
  y = partyMetaTable(doc, brand, { y, co, cl, coState: stateFromGstin(co.taxId), clState: stateFromGstin(cl.gstNumber), metaRows, buyerLabel: 'Consignee (Ship to)' });
  y = detailGrid(doc, brand, y, transportRows(ewayBill.transport, fmtDate), []);

  const qty = (v) => String(Math.round((Number(v) || 0) * 1000) / 1000);
  const body = lines.map((l, i) => [String(i + 1), lineDescription(l), l.hsn || '-', qty(l.qty), l.unit || 'Nos']);
  while (body.length < 4) body.push(['', '', '', '', '']);
  body.push([{ content: `Total: ${lines.length} item${lines.length === 1 ? '' : 's'}`, colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: qty(lines.reduce((a, l) => a + (Number(l.qty) || 0), 0)), styles: { fontStyle: 'bold', halign: 'right' } }, '']);
  y = baseTable(doc, brand, {
    startY: y,
    head: [['Sl', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Unit']],
    body,
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: IW - 10 - 26 - 26 - 22 }, 2: { cellWidth: 26, halign: 'center' }, 3: { cellWidth: 26, halign: 'right' }, 4: { cellWidth: 22, halign: 'center' } },
    styles: { fontSize: 7.5, valign: 'top' },
  });

  signatureStrip(doc, brand, {
    y,
    co,
    declaration: 'Declaration\nThe goods described above are dispatched to the consignee named here. Quantities and serial numbers were checked at the time of dispatch.',
    middle: `Received the above goods in good condition\n\n\n\nReceiver's name, signature & date${ewayBill.note ? `\n\nNote: ${ewayBill.note}` : ''}`,
  });

  finishDocument(doc, co, brand, 'This is a Computer Generated Document');
  const filename = `${['challan', challanNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

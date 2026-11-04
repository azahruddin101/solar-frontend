'use client';

// The bill / delivery challan: the goods leaving stock for a client, the optional delivery details, and their value
// with GST.
// Same grid layout as the tax invoice (gridPdf.js).
import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { gstSupplyType, invoiceTax, stateFromGstin } from './pricing.js';
import { fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { IM, ctx, detailGrid, finishDocument, goodsTable, moneyFormats, partyMetaTable, signatureStrip, taxSummary, titleBar, wordsRow } from './gridPdf.js';

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

/** Build the bill PDF bytes. `client` is the consignee (the client record). */
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

  let y = titleBar(doc, brand, IM, 'BILL', 'Delivery Challan');
  const metaRows = [
    ['Bill No.', ewayBill.ewayNo],
    ['Dated', fmtDate(ewayBill.issuedOn)],
    ['Reference', ewayBill.title || '—'],
  ];
  if (ewayBill.status === 'cancelled') metaRows.push(['Status', `Cancelled${ewayBill.cancelReason ? ` — ${ewayBill.cancelReason}` : ''}`]);
  y = partyMetaTable(doc, brand, { y, co, cl, coState: stateFromGstin(co.taxId), clState: stateFromGstin(cl.gstNumber), metaRows, buyerLabel: 'Consignee (Ship to)' });

  y = detailGrid(doc, brand, y, transportRows(ewayBill.transport, fmtDate), []);

  y = goodsTable(doc, brand, { y, groups: [{ lines }], withGst, amt, rs, tax, useIgst, total, descriptionHead: descHead });
  y = wordsRow(doc, brand, y, hasServices && !hasGoods ? 'Total (in words)' : 'Value of Goods (in words)', words(total));
  if (withGst) y = taxSummary(doc, brand, { y, tax, useIgst, amt, currency });

  y = signatureStrip(doc, brand, {
    y,
    co,
    declaration: hasGoods
      ? 'Declaration\nThe goods described above are dispatched to the consignee named here. Quantities and serial numbers were checked at the time of dispatch.'
      : 'Declaration\nThe services described above are billed as stated.',
    middle: `Received the above ${hasGoods ? 'goods' : 'services'} in good condition\n\n\n\nReceiver's signature & date${ewayBill.note ? `\n\nNote: ${ewayBill.note}` : ''}`,
  });

  finishDocument(doc, co, brand, 'This is a Computer Generated Document');
  const filename = `${['bill', ewayBill.ewayNo, pdfSlug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

'use client';

import { jsPDF } from 'jspdf';
import { loadBranding } from './branding.js';
import { enrichLinesGst, enrichLinesHsn, expandCollapsedPackageLines, gstSupplyType, invoiceTax, resolveProposalPricing, stateFromGstin, summarizeLinePricing } from './pricing.js';
import { fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { invoiceDetailRows } from './invoiceDetails.js';
import { IM, baseTable, ctx, detailGrid, ensurePage, finishDocument, goodsTable, moneyFormats, partyMetaTable, signatureStrip, taxSummary, termsBlock, titleBar, wordsRow } from './gridPdf.js';

const fmtDate = fmtPdfDate;
const slug = pdfSlug;

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** A stored line as the table prints it: stock lines show their batch in the detail; issued material prints plain. */
function printableLine(l) {
  return {
    ...l,
    // material issued to the installation (invoices from before issuing was removed) prints as a plain line: no batch or serial numbers
    detail: l.issueId ? String(l.detail || '').replace(/\s*·?\s*S\/N:.*$/s, '').trim() : [l.batchNo ? `Batch ${l.batchNo}` : '', l.detail].filter(Boolean).join(' · '), // stock lines carry their batch
    serials: l.issueId ? [] : l.serials,
  };
}

/**
 * The pricing an invoice prints. An invoice made from bills keeps the bills' frozen numbers as they are (nothing is
 * recomputed, so it matches what was paid). Any other invoice is re-summarised from its lines, GST added on top.
 */
function printablePricing(invoice, { quote, proposalPricing, catalog, packages }) {
  const stored = invoice.pricing;
  if (stored?.fromBills && stored.lines?.length) {
    const withGst = stored.withGst !== false && stored.invoiceGstMode !== 'without_gst';
    return { pricing: { ...stored, gstIncluded: false, withGst }, lines: stored.lines.filter((l) => l?.name).map(printableLine), withGst };
  }
  const resolved = resolveProposalPricing({ pricing: stored || proposalPricing, quote, total: invoice.total, title: invoice.title });
  const raw = resolved?.lines?.length
    ? { ...resolved, lines: enrichLinesGst(enrichLinesHsn(expandCollapsedPackageLines(resolved.lines, packages), catalog), catalog, packages, resolved.gstRate || 18) }
    : resolved;
  const withGst = raw?.invoiceGstMode !== 'without_gst';
  const split = raw?.extraDiscountAmount > 0 || raw?.proposalDiscountAmount > 0;
  const priced = summarizeLinePricing({
    lines: (raw?.lines || []).filter((l) => l?.name).map((l) => ({ ...printableLine(l), amount: l.amount ?? (Number(l.qty) || 1) * (Number(l.rate) || 0) })),
    gstIncluded: false,
    // invoices with an extra discount store the combined amount; older ones just their single discount
    discount: split ? raw.discountAmount : raw?.discount ?? 0,
    discountIsPercent: split ? false : raw?.discountIsPercent,
    withGst,
  });
  return { pricing: { ...raw, ...priced, discountRemark: raw?.discountRemark, gstIncluded: false, withGst, invoiceGstMode: raw?.invoiceGstMode }, lines: priced.lines.filter((l) => l?.name), withGst };
}

/** The discount lines under the goods: the proposal's and the extra one, each with its remark (older invoices: one). */
function discountRows(pricing, amt) {
  if (!(pricing?.discountAmount > 0)) return [];
  const split = pricing.extraDiscountAmount > 0 || pricing.proposalDiscountAmount > 0;
  const rows = split
    ? [[pricing.extraDiscountAmount > 0 ? 'Proposal discount' : 'Discount', pricing.discountRemark, pricing.proposalDiscountAmount], ['Extra discount', pricing.extraDiscountRemark, pricing.extraDiscountAmount]]
    : [['Discount', pricing.discountRemark, pricing.discountAmount]];
  return rows.filter(([, , value]) => value > 0).map(([label, remarkRaw, value]) => {
    const remark = String(remarkRaw || '').trim();
    return [remark ? `${label}\n${remark}` : label, `-${amt(value)}`];
  });
}

/** Build invoice PDF bytes (for S3 upload or preview). */
export async function buildInvoicePdfBlob({ invoice, company = {}, client = {}, currency = 'INR', quote = null, proposalPricing = null, catalog = null, packages = null }) {
  const brand = await loadBranding(company);
  const { company: co, client: clientBase, money } = ctx(company, client, currency);
  // an invoice on a proposal can carry the buyer's company name; a direct invoice has it in its Bill to
  const cl = invoice.billToCompany ? { ...clientBase, company: invoice.billToCompany } : clientBase;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Invoice ${invoice.invoiceNo}`, author: co.name, subject: `Tax invoice for ${cl.name || 'client'}`, creator: co.name });

  const { pricing, lines, withGst } = printablePricing(invoice, { quote, proposalPricing, catalog, packages });
  const total = pricing.total;
  const tax = invoiceTax(pricing, total);
  const supply = gstSupplyType(co.taxId, cl.gstNumber);
  const useIgst = withGst && supply === 'igst';
  const { amt, rs, words } = moneyFormats(currency, money);
  const coState = stateFromGstin(co.taxId);
  const clState = stateFromGstin(cl.gstNumber);
  const fromBills = Boolean(invoice.billRefs?.length);

  let y = titleBar(doc, brand, IM, withGst ? 'TAX INVOICE' : 'INVOICE');

  const metaRows = [
    ['Invoice No.', invoice.invoiceNo],
    ['Dated', fmtDate(invoice.issuedOn)],
    ['Reference', invoice.title || '—'],
  ];
  if (fromBills) metaRows.push(['Bills', invoice.billRefs.map((b) => b.billNo).join(', ')]);
  if (withGst && supply) metaRows.push(['Supply type', supply === 'igst' ? 'Inter-state (IGST)' : 'Intra-state (CGST/SGST)']);
  y = partyMetaTable(doc, brand, { y, co, cl, coState, clState, metaRows });

  // the optional reference & delivery details that were filled in: a two-column grid, terms of delivery across the row
  y = detailGrid(doc, brand, y, invoiceDetailRows(invoice.details, fmtDate));

  // an invoice from bills lists each bill's lines under its number
  const groups = fromBills
    ? invoice.billRefs.map((b) => ({ heading: `Bill ${b.billNo} · ${fmtDate(b.issuedOn)}${b.ewayNos?.length ? ` · E-way bill ${b.ewayNos.join(', ')}` : ''}`, lines: lines.filter((l) => l.billNo === b.billNo) })).filter((g) => g.lines.length)
    : [{ lines }];
  // lines of a bill the refs don't know (shouldn't happen) still print
  const grouped = new Set(groups.flatMap((g) => g.lines));
  const rest = lines.filter((l) => !grouped.has(l));
  if (rest.length) groups.push({ lines: rest });

  y = goodsTable(doc, brand, { y, groups, withGst, amt, rs, extraRows: discountRows(pricing, amt), tax, useIgst, total });
  y = wordsRow(doc, brand, y, 'Amount Chargeable (in words)', words(total));

  if (fromBills) {
    // what was paid on each bill: the invoice settles bills that were paid when they were made
    y = ensurePage(doc, y, 24);
    y = baseTable(doc, brand, {
      startY: y,
      head: [['Bill No.', 'Dated', 'E-way bills', 'Paid']],
      body: [
        ...invoice.billRefs.map((b) => [b.billNo, fmtDate(b.issuedOn), b.ewayNos?.length ? b.ewayNos.join(', ') : '-', amt(b.total)]),
        ['Total received', '', '', rs(invoice.billRefs.reduce((a, b) => a + (Number(b.total) || 0), 0))],
      ],
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 30 }, 3: { cellWidth: 36, halign: 'right' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === invoice.billRefs.length) d.cell.styles.fontStyle = 'bold';
      },
    });
  }

  if (withGst) y = taxSummary(doc, brand, { y, tax, useIgst, amt, currency });

  y = signatureStrip(doc, brand, { y, co, declaration: 'Declaration\nWe declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.' });

  termsBlock(doc, brand, y, invoice.termsAndConditions || co.pdfTerms);

  finishDocument(doc, co, brand, 'This is a Computer Generated Invoice');
  const filename = `${['invoice', invoice.invoiceNo, slug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

export async function generateInvoicePdf(params) {
  const { blob, filename } = await buildInvoicePdfBlob(params);
  downloadBlob(blob, filename);
}

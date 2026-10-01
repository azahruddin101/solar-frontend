'use client';

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from './branding.js';
import { formatMoney } from './energy.js';
import { pdfKit } from './pdf.js';
import { enrichLinesGst, enrichLinesHsn, expandCollapsedPackageLines, gstSupplyType, invoiceTax, resolveProposalPricing, stateFromGstin, summarizeLinePricing } from './pricing.js';
import { drawRichText, richTextIsEmpty } from './pdfRichText.js';
import { amountInWords, amountInWordsInr, fmtPdfDate, pdfSlug } from './billingPdfShared.js';

const { text, clip, wrap, tableStyle, placeImage } = pdfKit;
const { W, H } = pdfKit.pageSize;
const { INK, BODY, MUTED, LINE } = pdfKit.colors;

const fmtDate = fmtPdfDate;
const slug = pdfSlug;

const IM = 10;
const IW = W - 2 * IM;

function ctx(company, client, currency) {
  return { company: { name: 'Company', ...company }, client: client || {}, money: (v) => formatMoney(v, currency, { pdf: true, decimals: 2 }), currency };
}

function inrFig(value, currency) {
  const n = Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? n : formatMoney(value, currency, { pdf: true, decimals: 2 }).replace(/^INR /, '');
}

function baseTable(doc, brand, opts) {
  autoTable(doc, {
    ...tableStyle(doc, { brand, pageTitle: '' }),
    theme: 'grid',
    tableWidth: IW,
    margin: { left: IM, right: IM, top: 10, bottom: 14 },
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: INK, lineWidth: 0.15, textColor: INK, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fillColor: [255, 255, 255] },
    didDrawPage: () => {},
    ...opts,
  });
  return doc.lastAutoTable.finalY;
}

function companyLines(co, coState) {
  return [
    co.name,
    co.address,
    [co.phone, co.email].filter(Boolean).join('  |  '),
    co.taxId ? `GSTIN/UIN: ${co.taxId}` : '',
    coState ? `State: ${coState}` : '',
  ].filter(Boolean);
}

function clientLines(cl, clState) {
  const name = cl.billingName || cl.name;
  return [
    name,
    cl.address,
    [cl.phone && `Mob: ${cl.phone}`, cl.email].filter(Boolean).join('  |  '),
    cl.gstNumber ? `GSTIN/UIN: ${cl.gstNumber}` : '',
    clState ? `State: ${clState}` : '',
  ].filter(Boolean);
}

const LOGO_MAX_H_MM = 10;
const LOGO_NAME_GAP_MM = 5;

/** Draw logo top-aligned in a box; returns rendered height in mm. */
function placeLogoTop(doc, img, x, y, maxW, maxH) {
  const s = Math.min(maxW / img.width, maxH / img.height);
  const iw = img.width * s;
  const ih = img.height * s;
  doc.addImage(img.data, 'PNG', x, y, iw, ih, undefined, 'FAST');
  return ih;
}

function pageFooter(doc, company, brand, M) {
  const pages = doc.getNumberOfPages();
  const contact = [company.name, company.phone, company.email].filter(Boolean).join('   |   ');
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, H - 12, W - M, H - 12);
    text(doc, clip(doc, contact, W - 2 * M - 30, 7), M, H - 8, { size: 7, color: MUTED });
    if (pages > 1) text(doc, `${i} / ${pages}`, W - M, H - 8, { size: 7, style: 'bold', color: INK, align: 'right' });
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build invoice PDF bytes (for S3 upload or preview). */
export async function buildInvoicePdfBlob({ invoice, company = {}, client = {}, currency = 'INR', quote = null, proposalPricing = null, catalog = null, packages = null }) {
  const brand = await loadBranding(company);
  const { company: co, client: cl, money } = ctx(company, client, currency);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Invoice ${invoice.invoiceNo}`, author: co.name, subject: `Tax invoice for ${cl.name || 'client'}`, creator: co.name });

  const resolved = resolveProposalPricing({ pricing: invoice.pricing || proposalPricing, quote, total: invoice.total, title: invoice.title });
  const pricingRaw = resolved?.lines?.length
    ? {
      ...resolved,
      lines: enrichLinesGst(
        enrichLinesHsn(expandCollapsedPackageLines(resolved.lines, packages), catalog),
        catalog,
        packages,
        resolved.gstRate || 18,
      ),
    }
    : resolved;
  const withGst = pricingRaw?.invoiceGstMode !== 'without_gst';
  const gstIncluded = false;
  const priced = summarizeLinePricing({
    lines: (pricingRaw?.lines || []).filter((l) => l?.name).map((l) => ({
      name: l.name,
      detail: l.detail,
      hsn: l.hsn,
      qty: l.qty,
      unit: l.unit,
      rate: l.rate,
      gstPercent: l.gstPercent,
      amount: l.amount ?? (Number(l.qty) || 1) * (Number(l.rate) || 0),
    })),
    gstIncluded,
    discount: pricingRaw?.discount ?? 0,
    discountIsPercent: pricingRaw?.discountIsPercent,
    withGst,
  });
  const pricing = { ...pricingRaw, ...priced, gstIncluded, withGst, invoiceGstMode: pricingRaw?.invoiceGstMode };
  const tax = invoiceTax(pricing, priced.total);
  const supply = gstSupplyType(co.taxId, cl.gstNumber);
  const useIgst = withGst && supply === 'igst';
  const lines = priced.lines.filter((l) => l?.name);
  const amt = (v) => inrFig(v, currency);
  const rs = (v) => (currency === 'INR' ? `Rs. ${amt(v)}` : money(v));
  const coState = stateFromGstin(co.taxId);
  const clState = stateFromGstin(cl.gstNumber);

  const ensure = (yy, need) => {
    if (yy + need <= H - 16) return yy;
    doc.addPage('a4', 'portrait');
    return IM + 4;
  };

  let y = IM;

  y = baseTable(doc, brand, {
    startY: y,
    body: [[{ content: withGst ? 'TAX INVOICE' : 'INVOICE', styles: { halign: 'center', fontSize: 12, fontStyle: 'bold', cellPadding: 3 } }]],
    columnStyles: { 0: { cellWidth: IW } },
  });

  const sellerW = IW * 0.56;
  const metaW = IW - sellerW;
  const metaLabelW = metaW * 0.42;
  const metaValueW = metaW - metaLabelW;
  const logoTop = 2.5;
  const logoPad = brand.logo ? logoTop + LOGO_MAX_H_MM + LOGO_NAME_GAP_MM : logoTop;
  const metaRows = [
    ['Invoice No.', invoice.invoiceNo],
    ['Dated', fmtDate(invoice.issuedOn)],
    ['Reference', invoice.title || '—'],
  ];
  if (withGst && supply) {
    metaRows.push(['Supply type', supply === 'igst' ? 'Inter-state (IGST)' : 'Intra-state (CGST/SGST)']);
  }
  const LINE_H = 3.6;
  const wrappedCount = (ls) => ls.slice(1).reduce((n, l) => n + wrap(doc, l, sellerW - 5, 7.5).length, 0);
  const coLines = companyLines(co, coState);
  const clLines = clientLines(cl, clState);
  const sellerH = logoPad + 4.2 + wrappedCount(coLines) * LINE_H;
  const buyerH = clLines.length ? 2 + 4 + 4.2 + wrappedCount(clLines) * LINE_H : 0;
  const partyH = sellerH + buyerH + 3;
  const metaBody = [
    [{ content: '', rowSpan: metaRows.length, styles: { valign: 'top', cellPadding: { top: logoPad, left: 2.5, right: 2.5, bottom: 2.5 }, minCellHeight: 34 } }, metaRows[0][0], metaRows[0][1]],
    ...metaRows.slice(1),
  ];

  autoTable(doc, {
    ...tableStyle(doc, { brand, pageTitle: '' }),
    theme: 'grid',
    startY: y,
    margin: { left: IM, right: IM },
    tableWidth: IW,
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: INK, lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
    body: metaBody,
    columnStyles: {
      0: { cellWidth: sellerW },
      1: { cellWidth: metaLabelW, fontStyle: 'bold', fillColor: [252, 252, 253] },
      2: { cellWidth: metaValueW },
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 0 || d.row.index !== 0) return;
      const { x, y: cy, width } = d.cell;
      const lines = companyLines(co, coState);
      if (!lines.length) return;
      let ty = cy + logoTop;
      if (brand.logo) {
        const ih = placeLogoTop(doc, brand.logo, x + 2.5, cy + logoTop, Math.min(width - 5, 44), LOGO_MAX_H_MM);
        ty = cy + logoTop + ih + LOGO_NAME_GAP_MM;
      }
      const party = (ls) => {
        text(doc, ls[0], x + 2.5, ty, { size: 9, style: 'bold', color: INK, maxWidth: width - 5 });
        ty += 4.2;
        for (let i = 1; i < ls.length; i++) {
          for (const ln of wrap(doc, ls[i], width - 5, 7.5)) {
            text(doc, ln, x + 2.5, ty, { size: 7.5, color: BODY });
            ty += LINE_H;
          }
        }
      };
      party(lines);
      if (clLines.length) {
        ty += 2;
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.15);
        doc.line(x, ty, x + width, ty);
        ty += 4;
        text(doc, 'Bill to', x + 2.5, ty, { size: 7.5, style: 'bold', color: INK });
        ty += 4.2;
        party(clLines);
      }
      d.cell.text = [];
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 0 && d.row.index === 0) {
        d.cell.text = [];
        d.cell.styles.minCellHeight = Math.max(38, metaRows.length * 7 + logoPad + 8, partyH);
      }
    },
    didDrawPage: () => {},
  });
  y = doc.lastAutoTable.finalY;

  const gstColW = withGst ? 16 : 0;
  const descW = IW - 11 - 18 - 20 - 20 - 12 - gstColW - 24;
  const invoiceTotal = priced.total;
  const gstCell = (l) => {
    const pct = Number(l.gstPercent) || 0;
    if (!withGst || pct <= 0) return '-';
    return `${pct}%`;
  };
  const lineRow = (l, i) => {
    const detail = String(l.detail || '').trim();
    const desc = detail ? `${l.name}\n${detail}` : l.name;
    const lineAmt = l.lineTotal ?? l.amount ?? (l.qty ?? 1) * (l.rate ?? 0);
    const base = [String(i + 1), desc, l.hsn || '-', `${l.qty ?? 1} ${l.unit || 'Nos'}`, amt(l.rate), l.unit || 'Nos'];
    return withGst ? [...base, gstCell(l), amt(lineAmt)] : [...base, amt(lineAmt)];
  };
  const itemBody = lines.map((l, i) => lineRow(l, i));
  const minRows = Math.max(0, 4 - itemBody.length);
  const blank = withGst ? ['', '', '', '', '', '', '', ''] : ['', '', '', '', '', '', ''];
  for (let i = 0; i < minRows; i++) itemBody.push(blank);

  if (pricing?.discountAmount > 0) {
    const remark = String(pricing.discountRemark || '').trim();
    const discountDesc = remark ? `Discount\n${remark}` : 'Discount';
    itemBody.push(withGst ? ['', discountDesc, '', '', '', '', '', `-${amt(pricing.discountAmount)}`] : ['', discountDesc, '', '', '', '', `-${amt(pricing.discountAmount)}`]);
  }
  const qtyTotal = lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

  if (withGst && !useIgst && (tax.cgst > 0 || tax.sgst > 0)) {
    itemBody.push(withGst ? ['', 'CGST', '', '', '', '', '', amt(tax.cgst)] : []);
    itemBody.push(withGst ? ['', 'SGST', '', '', '', '', '', amt(tax.sgst)] : []);
  }

  itemBody.push(withGst ? ['', 'Total', '', qtyTotal ? String(qtyTotal) : '', '', '', '', rs(invoiceTotal)] : ['', 'Total', '', qtyTotal ? String(qtyTotal) : '', '', '', rs(invoiceTotal)]);

  const itemHead = withGst
    ? [['Sl\nNo.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'GST', 'Amount']]
    : [['Sl\nNo.', 'Description of Goods', 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount']];
  const itemCols = withGst
    ? {
        0: { cellWidth: 11, halign: 'center' },
        1: { cellWidth: descW },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: gstColW, halign: 'center' },
        7: { cellWidth: 24, halign: 'right' },
      }
    : {
        0: { cellWidth: 11, halign: 'center' },
        1: { cellWidth: descW },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 26, halign: 'right' },
      };

  y = baseTable(doc, brand, {
    startY: y,
    head: itemHead,
    body: itemBody,
    columnStyles: itemCols,
    didParseCell: (d) => {
      const isData = d.section === 'body' && d.row.index < lines.length;
      if (isData && d.column.index === 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 8;
      }
      if (d.section === 'body' && d.row.index >= lines.length + minRows) {
        d.cell.styles.fontStyle = 'bold';
        if (d.row.index === itemBody.length - 1) d.cell.styles.lineWidth = { top: 0.35 };
      }
    },
  });

  const words = currency === 'INR' ? amountInWordsInr(invoiceTotal) : amountInWords(invoiceTotal, currency);
  y = baseTable(doc, brand, {
    startY: doc.lastAutoTable.finalY,
    body: [[`Amount Chargeable (in words)\n${words}`]],
    columnStyles: { 0: { cellWidth: IW } },
    styles: { fontSize: 7.5, fontStyle: 'bold' },
  });

  if (withGst && tax.gst > 0) {
    y = ensure(doc.lastAutoTable.finalY, 32);
    const hsnRows = (tax.taxByHsn?.length ? tax.taxByHsn : [{ hsn: '-', taxable: tax.taxable, gst: tax.gst, rate: tax.rate }]).map((r) => {
      if (useIgst) return [r.hsn, amt(r.taxable), r.rate != null ? `${r.rate}%` : '', amt(r.gst), amt(r.gst)];
      const half = (Number(r.gst) || 0) / 2;
      const halfRate = r.rate != null ? `${(r.rate / 2).toFixed(2)}%` : '';
      return [r.hsn, amt(r.taxable), halfRate, amt(half), halfRate, amt(half), amt(r.gst)];
    });
    const taxHead = useIgst
      ? [['HSN/SAC', 'Taxable\nValue', { content: 'Integrated Tax', colSpan: 2, styles: { halign: 'center' } }, 'Total\nTax Amount'], ['', '', 'Rate', 'Amount', '']]
      : [['HSN/SAC', 'Taxable\nValue', { content: 'CGST', colSpan: 2, styles: { halign: 'center' } }, { content: 'SGST', colSpan: 2, styles: { halign: 'center' } }, 'Total\nTax Amount'], ['', '', 'Rate', 'Amount', 'Rate', 'Amount', '']];
    y = baseTable(doc, brand, {
      startY: y,
      head: taxHead,
      body: [...hsnRows, useIgst ? ['Total', amt(tax.taxable), '', amt(tax.gst), amt(tax.gst)] : ['Total', amt(tax.taxable), '', amt(tax.cgst), '', amt(tax.sgst), amt(tax.gst)]],
      columnStyles: useIgst
        ? { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
        : { 1: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index === hsnRows.length) d.cell.styles.fontStyle = 'bold';
      },
    });
    const taxWords = currency === 'INR' ? amountInWordsInr(tax.gst) : '';
    if (taxWords) {
      y = baseTable(doc, brand, {
        startY: doc.lastAutoTable.finalY,
        body: [[`Tax Amount (in words)\n${taxWords}`]],
        columnStyles: { 0: { cellWidth: IW } },
        styles: { fontSize: 7.5, fontStyle: 'bold' },
      });
    }
  }

  y = ensure(doc.lastAutoTable.finalY, 38);
  const footBody = [
    [
      'Declaration\nWe declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
      "Company's Bank Details\nA/c Holder's Name: -\nBank Name: -\nA/c No.: -\nBranch & IFS Code: -",
      `for ${co.name}\n\n\nAuthorised Signatory`,
    ],
  ];
  y = baseTable(doc, brand, {
    startY: y,
    body: footBody,
    columnStyles: { 0: { cellWidth: IW * 0.4 }, 1: { cellWidth: IW * 0.35 }, 2: { cellWidth: IW * 0.25, halign: 'right', valign: 'bottom' } },
    styles: { fontSize: 7, valign: 'top' },
    didDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === 2 && brand.signature) {
        const { x, y: cy, width, height } = d.cell;
        placeImage(doc, brand.signature, x + width - 42, cy + 8, 40, 14, 'right');
      }
    },
  });


  const termsToDisplay = invoice.termsAndConditions || co.pdfTerms;
  const hasTerms = termsToDisplay && (typeof termsToDisplay === 'string' ? termsToDisplay.trim() : !richTextIsEmpty(termsToDisplay));
  if (hasTerms) {
    y = ensure(doc.lastAutoTable.finalY + 6, 20);
    y += 4;
    text(doc, 'Terms & Conditions', IM, y, { size: 9, style: 'bold', color: INK });
    drawRichText(doc, termsToDisplay, { x: IM, y: y + 5, width: IW, size: 8, color: BODY, headingColor: INK, linkColor: brand.primary, markerColor: brand.primary, ensure: (yy, need) => ensure(yy, need) });
  }

  const pages = doc.getNumberOfPages();
  doc.setPage(pages);
  text(doc, 'This is a Computer Generated Invoice', W / 2, H - 14, { size: 7, color: MUTED, align: 'center' });
  pageFooter(doc, co, brand, IM);
  const filename = `${['invoice', invoice.invoiceNo, slug(cl.name)].filter(Boolean).join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

export async function generateInvoicePdf(params) {
  const { blob, filename } = await buildInvoicePdfBlob(params);
  downloadBlob(blob, filename);
}

'use client';

// The grid-style A4 documents of the sale chain — e-way bill, bill and tax invoice — share these pieces: the title
// bar, the seller / buyer box with the document's numbers beside it, the goods table with its totals, the HSN tax
// summary, the declaration & signature strip and the page footer. Each builder (invoicePdf.js, ewayBillPdf.js,
// billPdf.js) stacks them in its own order.
import { autoTable } from 'jspdf-autotable';
import { formatMoney } from './energy.js';
import { pdfKit } from './pdf.js';
import { drawRichText, richTextIsEmpty } from './pdfRichText.js';
import { amountInWords, amountInWordsInr } from './billingPdfShared.js';

const { text, clip, wrap, tableStyle, placeImage } = pdfKit;
const { W, H } = pdfKit.pageSize;
const { INK, BODY, MUTED, LINE } = pdfKit.colors;

export const IM = 10; // page margin
export const IW = W - 2 * IM; // content width
const LABEL_FILL = [252, 252, 253];

export function ctx(company, client, currency) {
  const cl = { ...(client || {}) };
  if (/^[0-9a-f]{24}$/i.test(String(cl.company || ''))) delete cl.company; // a client record's tenant id, not a buyer's company name
  return { company: { name: 'Company', ...company }, client: cl, money: (v) => formatMoney(v, currency, { pdf: true, decimals: 2 }), currency };
}

/** "1,23,456.00" for INR; the formatted amount without its code otherwise. */
export function inrFig(value, currency) {
  const n = Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? n : formatMoney(value, currency, { pdf: true, decimals: 2 }).replace(/^INR /, '');
}

/** The amount formatters of a document: `amt` for table cells, `rs` for the grand total, and the words. */
export function moneyFormats(currency, money) {
  const amt = (v) => inrFig(v, currency);
  return {
    amt,
    rs: (v) => (currency === 'INR' ? `Rs. ${amt(v)}` : money(v)),
    words: (v) => (currency === 'INR' ? amountInWordsInr(v) : amountInWords(v, currency)),
  };
}

export function baseTable(doc, brand, opts) {
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

/** Start a new page when `need` mm won't fit under `yy`; returns the y to draw at. */
export function ensurePage(doc, yy, need) {
  if (yy + need <= H - 16) return yy;
  doc.addPage('a4', 'portrait');
  return IM + 4;
}

export function companyLines(co, coState) {
  return [
    co.name,
    co.address,
    [co.phone, co.email].filter(Boolean).join('  |  '),
    co.taxId ? `GSTIN/UIN: ${co.taxId}` : '',
    coState ? `State: ${coState}` : '',
  ].filter(Boolean);
}

export function clientLines(cl, clState) {
  const name = cl.billingName || cl.name;
  return [
    ...(cl.company && cl.company !== name ? [cl.company, name] : [name]), // a company is the bold heading, the contact person below it
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

export function pageFooter(doc, company, brand, M = IM) {
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

/** The document's title across the page (TAX INVOICE, E-WAY BILL…), optionally with a small line under it. */
export function titleBar(doc, brand, y, title, subtitle = '') {
  return baseTable(doc, brand, {
    startY: y,
    body: [[{ content: subtitle ? `${title}\n${subtitle}` : title, styles: { halign: 'center', fontSize: 12, fontStyle: 'bold', cellPadding: 3 } }]],
    columnStyles: { 0: { cellWidth: IW } },
    didParseCell: (d) => {
      if (subtitle) d.cell.styles.fontSize = 12; // the subtitle shares the cell; keep it readable
    },
  });
}

/**
 * The seller (with logo) and the buyer in the left box, the document's label / value rows on the right.
 * `metaRows`: [[label, value], …]. Returns the y below the box.
 */
export function partyMetaTable(doc, brand, { y, co, cl, coState = '', clState = '', metaRows, buyerLabel = 'Bill to' }) {
  const sellerW = IW * 0.56;
  const metaW = IW - sellerW;
  const metaLabelW = metaW * 0.42;
  const metaValueW = metaW - metaLabelW;
  const logoTop = 2.5;
  const logoPad = brand.logo ? logoTop + LOGO_MAX_H_MM + LOGO_NAME_GAP_MM : logoTop;
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
      1: { cellWidth: metaLabelW, fontStyle: 'bold', fillColor: LABEL_FILL },
      2: { cellWidth: metaValueW },
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 0 || d.row.index !== 0) return;
      const { x, y: cy, width } = d.cell;
      if (!coLines.length) return;
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
      party(coLines);
      if (clLines.length) {
        ty += 2;
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.15);
        doc.line(x, ty, x + width, ty);
        ty += 4;
        text(doc, buyerLabel, x + 2.5, ty, { size: 7.5, style: 'bold', color: INK });
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
  return doc.lastAutoTable.finalY;
}

/**
 * Label / value pairs two to a row; a row whose label is in `fullWidth` takes the whole width. Returns y (unchanged
 * when there are no rows).
 */
export function detailGrid(doc, brand, y, rows, fullWidth = ['Terms of Delivery']) {
  if (!rows?.length) return y;
  const wide = rows.filter(([label]) => fullWidth.includes(label));
  const pairs = rows.filter((r) => !wide.includes(r));
  const labelW = IW * 0.17;
  const valueW = IW * 0.33;
  const labelStyle = { fontStyle: 'bold', fillColor: LABEL_FILL };
  const body = [];
  for (let i = 0; i < pairs.length; i += 2) {
    const [l1, v1] = pairs[i];
    if (!pairs[i + 1]) { // an odd one out takes the whole row
      body.push([{ content: l1, styles: labelStyle }, { content: v1, colSpan: 3 }]);
      break;
    }
    const [l2, v2] = pairs[i + 1];
    body.push([{ content: l1, styles: labelStyle }, v1, { content: l2, styles: labelStyle }, v2]);
  }
  for (const [label, value] of wide) body.push([{ content: label, styles: labelStyle }, { content: value, colSpan: 3 }]);
  return baseTable(doc, brand, {
    startY: y,
    body,
    columnStyles: { 0: { cellWidth: labelW }, 1: { cellWidth: valueW }, 2: { cellWidth: labelW }, 3: { cellWidth: valueW } },
  });
}

/** A line's amount before any discount and before GST: qty × rate as entered. */
const lineGross = (l) => (l.gross != null ? Number(l.gross) : Math.round((Number(l.qty ?? 1) || 1) * (Number(l.rate) || 0) * 100) / 100);

/** The description cell of a goods line: name, batch and detail, then the serial numbers. */
export function lineDescription(l) {
  const serials = Array.isArray(l.serials) ? l.serials.filter(Boolean) : [];
  // invoices issued before serials were stored separately carry "S/N: …" inside the detail: print it once
  const detail = (serials.length ? String(l.detail || '').replace(/\s*·?\s*S\/N:.*$/s, '') : String(l.detail || '')).trim();
  return [l.name, detail, serials.length ? `S/N: ${serials.join(', ')}` : ''].filter(Boolean).join('\n');
}

/**
 * The goods table: numbered lines (optionally in groups, each under a heading row) whose Amount is qty × rate as
 * entered, at least four rows, then — when there is a discount — Subtotal, the `extraRows` ([description,
 * signedAmount]) and the taxable value, then CGST / SGST (or IGST) and the total, so the column adds up top to bottom.
 * `groups`: [{ heading?, lines }]; `lines` carry qty, unit, rate, gstPercent and `gross` (qty × rate before discount).
 */
export function goodsTable(doc, brand, { y, groups, withGst, amt, rs, extraRows = [], tax, useIgst, total, descriptionHead = 'Description of Goods' }) {
  const cols = withGst ? 8 : 7;
  const blank = () => Array.from({ length: cols }, () => '');
  const gstCell = (l) => {
    const pct = Number(l.gstPercent) || 0;
    return !withGst || pct <= 0 ? '-' : `${pct}%`;
  };
  const body = [];
  const kind = []; // 'line' | 'heading' | 'blank' | 'foot' per body row
  let n = 0;
  for (const g of groups) {
    if (g.heading) {
      body.push([{ content: g.heading, colSpan: cols, styles: { fontStyle: 'bold', fillColor: LABEL_FILL, fontSize: 7.5 } }]);
      kind.push('heading');
    }
    for (const l of g.lines) {
      n += 1;
      const lineAmt = lineGross(l);
      const base = [String(n), lineDescription(l), l.hsn || '-', `${l.qty ?? 1} ${l.unit || 'Nos'}`, amt(l.rate), l.unit || 'Nos'];
      body.push(withGst ? [...base, gstCell(l), amt(lineAmt)] : [...base, amt(lineAmt)]);
      kind.push('line');
    }
  }
  const minRows = Math.max(0, 4 - body.length);
  for (let i = 0; i < minRows; i++) {
    body.push(blank());
    kind.push('blank');
  }
  const foot = (desc, value) => {
    const row = blank();
    row[1] = desc;
    row[cols - 1] = value;
    body.push(row);
    kind.push('foot');
  };
  const all = groups.flatMap((g) => g.lines);
  if (extraRows.length) {
    foot('Subtotal', amt(all.reduce((a, l) => a + lineGross(l), 0)));
    for (const [desc, value] of extraRows) foot(desc, value);
    if (withGst) foot('Taxable value', amt(tax.taxable));
  }
  const qtyTotal = all.reduce((a, l) => a + (Number(l.qty) || 0), 0);
  if (withGst && useIgst && tax.igst > 0) foot('IGST', amt(tax.igst));
  if (withGst && !useIgst && (tax.cgst > 0 || tax.sgst > 0)) {
    foot('CGST', amt(tax.cgst));
    foot('SGST', amt(tax.sgst));
  }
  const totalRow = blank();
  totalRow[1] = 'Total';
  totalRow[3] = qtyTotal ? String(qtyTotal) : '';
  totalRow[cols - 1] = rs(total);
  body.push(totalRow);
  kind.push('foot');

  const descW = IW - 11 - 18 - 20 - 20 - 12 - (withGst ? 16 : 0) - 24;
  const head = withGst
    ? [['Sl\nNo.', descriptionHead, 'HSN/SAC', 'Quantity', 'Rate', 'per', 'GST', 'Amount']]
    : [['Sl\nNo.', descriptionHead, 'HSN/SAC', 'Quantity', 'Rate', 'per', 'Amount']];
  const columnStyles = withGst
    ? {
        0: { cellWidth: 11, halign: 'center' },
        1: { cellWidth: descW },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 12, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
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
  return baseTable(doc, brand, {
    startY: y,
    head,
    body,
    columnStyles,
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const k = kind[d.row.index];
      if (k === 'line' && d.column.index === 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fontSize = 8;
      }
      if (k === 'foot') {
        d.cell.styles.fontStyle = 'bold';
        if (d.row.index === body.length - 1) d.cell.styles.lineWidth = { top: 0.35 };
      }
    },
  });
}

/** A one-cell bold row: "Amount Chargeable (in words)" and the words under it. */
export function wordsRow(doc, brand, y, label, words) {
  return baseTable(doc, brand, {
    startY: y,
    body: [[`${label}\n${words}`]],
    columnStyles: { 0: { cellWidth: IW } },
    styles: { fontSize: 7.5, fontStyle: 'bold' },
  });
}

/** GST by HSN/SAC — CGST + SGST columns, or one IGST column for an inter-state supply — and the tax in words. */
export function taxSummary(doc, brand, { y, tax, useIgst, amt, currency }) {
  if (!(tax.gst > 0)) return y;
  y = ensurePage(doc, y, 32);
  const rows = (tax.taxByHsn?.length ? tax.taxByHsn : [{ hsn: '-', taxable: tax.taxable, gst: tax.gst, rate: tax.rate }]).map((r) => {
    if (useIgst) return [r.hsn, amt(r.taxable), r.rate != null ? `${r.rate}%` : '', amt(r.gst), amt(r.gst)];
    const half = (Number(r.gst) || 0) / 2;
    const halfRate = r.rate != null ? `${(r.rate / 2).toFixed(2)}%` : '';
    return [r.hsn, amt(r.taxable), halfRate, amt(half), halfRate, amt(half), amt(r.gst)];
  });
  const head = useIgst
    ? [['HSN/SAC', 'Taxable\nValue', { content: 'Integrated Tax', colSpan: 2, styles: { halign: 'center' } }, 'Total\nTax Amount'], ['', '', 'Rate', 'Amount', '']]
    : [['HSN/SAC', 'Taxable\nValue', { content: 'CGST', colSpan: 2, styles: { halign: 'center' } }, { content: 'SGST', colSpan: 2, styles: { halign: 'center' } }, 'Total\nTax Amount'], ['', '', 'Rate', 'Amount', 'Rate', 'Amount', '']];
  y = baseTable(doc, brand, {
    startY: y,
    head,
    body: [...rows, useIgst ? ['Total', amt(tax.taxable), '', amt(tax.gst), amt(tax.gst)] : ['Total', amt(tax.taxable), '', amt(tax.cgst), '', amt(tax.sgst), amt(tax.gst)]],
    columnStyles: useIgst
      ? { 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
      : { 1: { halign: 'right' }, 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === rows.length) d.cell.styles.fontStyle = 'bold';
    },
  });
  const taxWords = currency === 'INR' ? amountInWordsInr(tax.gst) : '';
  if (taxWords) y = wordsRow(doc, brand, y, 'Tax Amount (in words)', taxWords);
  return y;
}

/** Declaration on the left, bank details in the middle, "for <company> / Authorised Signatory" with the signature on the right. */
export function signatureStrip(doc, brand, { y, co, declaration, middle = "Company's Bank Details\nA/c Holder's Name: -\nBank Name: -\nA/c No.: -\nBranch & IFS Code: -" }) {
  y = ensurePage(doc, y, 38);
  return baseTable(doc, brand, {
    startY: y,
    body: [[declaration, middle, `for ${co.name}\n\n\nAuthorised Signatory`]],
    columnStyles: { 0: { cellWidth: IW * 0.4 }, 1: { cellWidth: IW * 0.35 }, 2: { cellWidth: IW * 0.25, halign: 'right', valign: 'bottom' } },
    styles: { fontSize: 7, valign: 'top' },
    didDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === 2 && brand.signature) {
        const { x, y: cy, width } = d.cell;
        placeImage(doc, brand.signature, x + width - 42, cy + 8, 40, 14, 'right');
      }
    },
  });
}

/** The terms & conditions (rich text or plain), if any. Returns true when something was drawn. */
export function termsBlock(doc, brand, y, terms) {
  const has = terms && (typeof terms === 'string' ? terms.trim() : !richTextIsEmpty(terms));
  if (!has) return false;
  y = ensurePage(doc, y + 6, 20) + 4;
  text(doc, 'Terms & Conditions', IM, y, { size: 9, style: 'bold', color: INK });
  drawRichText(doc, terms, { x: IM, y: y + 5, width: IW, size: 8, color: BODY, headingColor: INK, linkColor: brand.primary, markerColor: brand.primary, ensure: (yy, need) => ensurePage(doc, yy, need) });
  return true;
}

/** "This is a Computer Generated …" on the last page, then the footer on every page. */
export function finishDocument(doc, co, brand, note) {
  doc.setPage(doc.getNumberOfPages());
  text(doc, note, W / 2, H - 14, { size: 7, color: MUTED, align: 'center' });
  pageFooter(doc, co, brand, IM);
}

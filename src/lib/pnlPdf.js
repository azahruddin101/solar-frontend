'use client';

// One project's profit & loss as an A4 statement, in the company's branding: the budget, the expenses by reason, the
// profit (or loss), where the money went, and every expense entry.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { documentParts } from './billingPdf.js';
import { fmtPdfDate, pdfSlug } from './billingPdfShared.js';
import { loadBranding } from './branding.js';
import { downloadBlob } from './invoicePdf.js';
import { pdfKit } from './pdf.js';

const { text, clip, wrap } = pdfKit;
const { W, H, M, CW } = pdfKit.pageSize;
const { INK, BODY, LINE, SOFT } = pdfKit.colors;
const { context, letterhead, label, party, pageFooter } = documentParts;

const GREY = [100, 116, 139];
const TRACK = [226, 232, 240];
// profit / near the budget / loss: always with a word, never colour alone
const TONE = {
  good: { ink: [21, 128, 61], tint: [240, 253, 244], bar: [22, 163, 74] },
  warning: { ink: [180, 83, 9], tint: [255, 251, 235], bar: [245, 158, 11] },
  critical: { ink: [185, 28, 28], tint: [254, 242, 242], bar: [220, 38, 38] },
};
const FOOTER_SPACE = 22; // keep clear of the page footer
const round2 = (n) => Math.round(n * 100) / 100;

/** The largest size (down to `min`) at which `str` fits `width`. */
function fitSize(doc, str, width, size, min, style = 'bold') {
  let s = size;
  doc.setFont('helvetica', style);
  while (s > min) {
    doc.setFontSize(s);
    if (doc.getTextWidth(str) <= width) break;
    s -= 0.5;
  }
  return s;
}

/** Room for `h` more mm on this page, or a new page (returns the y to draw at). */
function room(doc, y, h) {
  if (y + h <= H - FOOTER_SPACE) return y;
  doc.addPage();
  return 20;
}

function budgetState(spent, budget) {
  if (!(budget > 0)) return null;
  const used = spent / budget;
  if (used > 1) return { key: 'critical', label: 'Over budget', used };
  if (used >= 0.9) return { key: 'warning', label: 'Near budget', used };
  return { key: 'good', label: 'Within budget', used };
}

/** Expenses grouped by reason, largest first. */
function byReason(items) {
  const groups = new Map();
  for (const e of items) {
    const g = groups.get(e.reason) || { reason: e.reason, amount: 0, count: 0 };
    g.amount += Number(e.amount) || 0;
    g.count += 1;
    groups.set(e.reason, g);
  }
  return [...groups.values()].map((g) => ({ ...g, amount: round2(g.amount) })).sort((a, b) => b.amount - a.amount);
}

/** A summary tile: small caps label, a big figure fitted to the tile, and a hint line. */
function tile(doc, x, y, w, h, { title, value, hint, accent, valueColor = INK }) {
  doc.setFillColor(...SOFT);
  doc.roundedRect(x, y, w, h, 1.6, 1.6, 'F');
  doc.setFillColor(...accent);
  doc.rect(x, y + 1.6, 1.2, h - 3.2, 'F');
  text(doc, title.toUpperCase(), x + 5, y + 6.5, { size: 7, style: 'bold', color: GREY });
  const size = fitSize(doc, value, w - 9, 13, 8.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...valueColor);
  doc.text(value, x + 5, y + 14.5);
  if (hint) text(doc, clip(doc, hint, w - 9, 7.5), x + 5, y + 20.5, { size: 7.5, color: GREY });
}

/** A label / amount line of the statement. */
function statementLine(doc, y, { label: name, note, share, amount, bold, indent = 0, color = INK }) {
  const x = M + 4 + indent;
  const style = bold ? 'bold' : 'normal';
  const shown = clip(doc, name, 92 - indent, 9.5, style); // also sets the font, for measuring it below
  text(doc, shown, x, y, { size: 9.5, style, color });
  if (note) text(doc, note, x + doc.getTextWidth(shown) + 2.5, y, { size: 7.5, color: GREY });
  if (share) text(doc, share, M + 128, y, { size: 8, color: GREY, align: 'right' });
  text(doc, amount, W - M - 4, y, { size: 9.5, style: bold ? 'bold' : 'normal', color, align: 'right' });
}

/**
 * The statement as PDF bytes. `expense` is GET /api/expenses/design/:id ({ design, items, total, budget, profit }),
 * `company` the signed-in company (branding and contact), `preparedBy` the person downloading it.
 */
export async function buildPnlPdfBlob({ expense, company = {}, currency = 'INR', preparedBy = '' }) {
  const { design, items = [], total = 0, budget, profit } = expense;
  const brand = await loadBranding(company);
  const { company: co, money } = context(company, design.client, currency);
  const paren = (v) => (v > 0 ? `(${money(v)})` : money(0)); // amounts taken away, accounting style
  const hasBudget = Boolean(budget && budget.amount > 0);
  const loss = profit !== null && profit !== undefined && profit < 0;
  const state = hasBudget ? budgetState(total, budget.amount) : null;
  const reasons = byReason(items);
  const now = new Date();

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `Profit & loss — ${design.name}`, author: co.name, subject: `Project profit and loss statement${design.client?.name ? ` for ${design.client.name}` : ''}`, creator: co.name });

  let y = letterhead(doc, brand, co, { title: 'PROFIT & LOSS', subtitle: 'Project statement', date: now, dateLabel: 'Generated' });

  // project and period
  const half = (CW - 10) / 2;
  const dates = items.map((e) => new Date(e.spentOn)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
  const period = dates.length ? (dates.length === 1 || fmtPdfDate(dates[0]) === fmtPdfDate(dates.at(-1)) ? fmtPdfDate(dates[0]) : `${fmtPdfDate(dates[0])} – ${fmtPdfDate(dates.at(-1))}`) : 'No expenses yet';
  const a = party(doc, brand, M, y, half, 'Project', design.name, [design.client?.name && `Client: ${design.client.name}`, hasBudget && budget.updatedByName && `Budget set by ${budget.updatedByName}`]);
  const b = party(doc, brand, M + half + 10, y, half, 'Period covered', period, [`${items.length} expense entr${items.length === 1 ? 'y' : 'ies'} across ${reasons.length} reason${reasons.length === 1 ? '' : 's'}`, preparedBy && `Prepared by ${preparedBy}`]);
  y = Math.max(a, b) + 5;

  // summary tiles
  const gap = 4;
  const tw = (CW - gap * 3) / 4;
  const th = 25;
  const resultTone = hasBudget ? (loss ? TONE.critical : TONE.good) : null;
  tile(doc, M, y, tw, th, { title: 'Budget', value: hasBudget ? money(budget.amount) : 'Not set', hint: hasBudget ? budget.note || 'Planned for the project' : 'Set one to see profit', accent: brand.primary });
  tile(doc, M + (tw + gap), y, tw, th, { title: 'Total spent', value: money(total), hint: `${items.length} entr${items.length === 1 ? 'y' : 'ies'}`, accent: brand.primary });
  tile(doc, M + (tw + gap) * 2, y, tw, th, {
    title: loss ? 'Loss' : 'Profit',
    value: hasBudget ? money(Math.abs(profit)) : '—',
    hint: hasBudget ? (loss ? 'Spent over the budget' : 'Budget left') : 'Needs a budget',
    accent: resultTone?.bar || TRACK,
    valueColor: resultTone?.ink || INK,
  });
  // budget used: percentage and a meter
  const ux = M + (tw + gap) * 3;
  doc.setFillColor(...SOFT);
  doc.roundedRect(ux, y, tw, th, 1.6, 1.6, 'F');
  doc.setFillColor(...(state ? TONE[state.key].bar : TRACK));
  doc.rect(ux, y + 1.6, 1.2, th - 3.2, 'F');
  text(doc, 'BUDGET USED', ux + 5, y + 6.5, { size: 7, style: 'bold', color: GREY });
  if (state) {
    const pct = Math.round(state.used * 1000) / 10;
    text(doc, `${pct}%`, ux + 5, y + 14.5, { size: 13, style: 'bold', color: TONE[state.key].ink });
    const mw = tw - 10;
    doc.setFillColor(...TRACK);
    doc.roundedRect(ux + 5, y + 17, mw, 1.6, 0.8, 0.8, 'F');
    doc.setFillColor(...TONE[state.key].bar);
    doc.roundedRect(ux + 5, y + 17, Math.max(1.6, mw * Math.min(state.used, 1)), 1.6, 0.8, 0.8, 'F');
    text(doc, state.label, ux + 5, y + 22.3, { size: 7.5, style: 'bold', color: TONE[state.key].ink });
  } else {
    text(doc, '—', ux + 5, y + 14.5, { size: 13, style: 'bold', color: GREY });
    text(doc, 'No budget to compare', ux + 5, y + 20.5, { size: 7.5, color: GREY });
  }
  y += th + 11;

  // the statement
  label(doc, 'Statement', M, y, brand);
  y += 3;
  const rowH = 7.2;
  const statementH = rowH * (reasons.length + 4) + 6;
  y = room(doc, y, Math.min(statementH, 120));
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(M, y, W - M, y);
  y += 6;
  statementLine(doc, y, { label: 'Budget', amount: hasBudget ? money(budget.amount) : 'Not set', bold: true });
  y += rowH;
  text(doc, 'LESS: EXPENSES', M + 4, y, { size: 7.5, style: 'bold', color: GREY });
  if (reasons.length) text(doc, 'SHARE', M + 128, y, { size: 7, style: 'bold', color: GREY, align: 'right' });
  y += rowH - 1;
  if (!reasons.length) {
    text(doc, 'No expenses recorded yet', M + 9, y, { size: 9, color: GREY });
    y += rowH;
  }
  for (const r of reasons) {
    y = room(doc, y, rowH);
    statementLine(doc, y, { label: r.reason, note: r.count > 1 ? `${r.count} entries` : '', share: total > 0 ? `${Math.round((r.amount / total) * 1000) / 10}%` : '', amount: paren(r.amount), indent: 5, color: BODY });
    y += rowH;
  }
  y = room(doc, y, rowH + 22);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(M + 4, y - 4.5, W - M - 4, y - 4.5);
  statementLine(doc, y, { label: 'Total expenses', amount: paren(total), bold: true });
  y += 5;

  // the result
  const bandH = 17;
  const tone = resultTone || { ink: INK, tint: SOFT, bar: brand.primary };
  doc.setFillColor(...tone.tint);
  doc.roundedRect(M, y, CW, bandH, 1.8, 1.8, 'F');
  doc.setFillColor(...tone.bar);
  doc.rect(M, y + 1.8, 1.6, bandH - 3.6, 'F');
  if (hasBudget) {
    text(doc, loss ? 'NET LOSS' : 'NET PROFIT', M + 7, y + 7.4, { size: 9.5, style: 'bold', color: tone.ink });
    const margin = Math.abs(Math.round((profit / budget.amount) * 1000) / 10);
    text(doc, loss ? `Spending went ${margin}% over the budget` : `${margin}% of the budget is left`, M + 7, y + 12.6, { size: 8, color: BODY });
    const value = `${loss ? '- ' : ''}${money(Math.abs(profit))}`;
    text(doc, value, W - M - 6, y + 11, { size: fitSize(doc, value, 90, 16, 11), style: 'bold', color: tone.ink, align: 'right' });
  } else {
    text(doc, 'PROFIT OR LOSS', M + 7, y + 7.4, { size: 9.5, style: 'bold', color: INK });
    text(doc, 'Set a budget for this project to see its profit or loss.', M + 7, y + 12.6, { size: 8, color: BODY });
  }
  y += bandH + 12;

  // where the money went
  if (reasons.length > 1 && total > 0) {
    const shown = reasons.length > 8 ? [...reasons.slice(0, 7), { reason: `${reasons.length - 7} other reasons`, amount: round2(reasons.slice(7).reduce((s, r) => s + r.amount, 0)) }] : reasons;
    const barRow = 8.2;
    y = room(doc, y, 10 + shown.length * barRow);
    label(doc, 'Where the money went', M, y, brand);
    y += 6;
    const nameW = 54;
    const valueW = 46;
    const trackX = M + nameW + 4;
    const trackW = CW - nameW - valueW - 8;
    const max = Math.max(...shown.map((r) => r.amount));
    for (const r of shown) {
      text(doc, clip(doc, r.reason, nameW, 8.5), M, y + 3.4, { size: 8.5, color: INK });
      doc.setFillColor(...SOFT);
      doc.roundedRect(trackX, y, trackW, 4.6, 1, 1, 'F');
      doc.setFillColor(...brand.primary);
      doc.roundedRect(trackX, y, Math.max(1.2, trackW * (r.amount / max)), 4.6, 1, 1, 'F');
      text(doc, money(r.amount), W - M, y + 3.4, { size: 8.5, style: 'bold', color: INK, align: 'right' });
      text(doc, `${Math.round((r.amount / total) * 1000) / 10}%`, W - M - valueW + 6, y + 3.4, { size: 7.5, color: GREY, align: 'right' });
      y += barRow;
    }
    y += 6;
  }

  // every entry
  if (items.length) {
    y = room(doc, y, 30);
    label(doc, 'Expense entries', M, y, brand);
    autoTable(doc, {
      startY: y + 3,
      theme: 'plain',
      margin: { left: M, right: M, top: 20, bottom: FOOTER_SPACE },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 }, textColor: BODY, lineColor: LINE, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
      headStyles: { fillColor: brand.primary, textColor: brand.primaryFg, fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
      footStyles: { fillColor: SOFT, textColor: INK, fontStyle: 'bold', fontSize: 9.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      showHead: 'everyPage',
      showFoot: 'lastPage',
      head: [['Date', 'Reason', 'Entered by', 'Amount']],
      body: [...items].sort((p, q) => new Date(p.spentOn) - new Date(q.spentOn)).map((e) => [fmtPdfDate(e.spentOn), e.note ? `${e.reason}\n${e.note}` : e.reason, e.createdByName || '-', money(e.amount)]),
      foot: [[{ content: `Total — ${items.length} entr${items.length === 1 ? 'y' : 'ies'}`, colSpan: 3 }, money(total)]],
      columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 52 }, 3: { cellWidth: 38, halign: 'right' } },
      didParseCell: (d) => {
        if (d.column.index === 3) d.cell.styles.halign = 'right';
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // how it's worked out
  const notes = [
    'Profit is the project budget minus every expense recorded against it; spending more than the budget is a loss.',
    'Amounts in brackets are deducted. This is a computer-generated statement of the expenses recorded in the workspace.',
  ];
  y = room(doc, y, 14);
  for (const n of notes) {
    const lines = wrap(doc, n, CW, 7.5);
    text(doc, lines, M, y, { size: 7.5, color: GREY, lineHeight: 1.3 });
    y += lines.length * 3.6 + 1;
  }

  pageFooter(doc, co, brand);
  // a thin band in the brand colour across the top of every page; later pages name the statement
  for (let i = 1; i <= doc.getNumberOfPages(); i += 1) {
    doc.setPage(i);
    doc.setFillColor(...brand.primary);
    doc.rect(0, 0, W, 2.2, 'F');
    if (i > 1) text(doc, clip(doc, `Profit & loss — ${design.name}`, CW - 40, 8, 'bold'), M, 12, { size: 8, style: 'bold', color: GREY });
  }

  const filename = `${['profit-and-loss', pdfSlug(design.name) || 'project', now.toISOString().slice(0, 10)].join('_')}.pdf`;
  return { blob: doc.output('blob'), filename };
}

/** Builds the statement and saves it. */
export async function downloadPnlPdf(params) {
  const { blob, filename } = await buildPnlPdfBlob(params);
  downloadBlob(blob, filename);
}

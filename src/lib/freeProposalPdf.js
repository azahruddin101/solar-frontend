'use client';

// The PDF of the free proposal maker (/free-proposal). It looks like a workspace proposal: the same covers
// (pdfCoverVariants.js) and the same page furniture (pdf.js `pdfPage`), but everything on it is what the visitor
// typed: their company, their client, the system, the price lines and the terms. Nothing comes from a workspace.
//   1 cover · 2 summary, key figures and system · 3 price, terms and acceptance
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatMoney, formatNumber } from './energy.js';
import { lineAmount, proposalSavings, proposalTotals } from './freeProposalCalc.js';
import { pdfKit, pdfPage } from './pdf.js';
import { drawCoverStyle } from './pdfCoverVariants.js';
import { drawRichText, richTextIsEmpty } from './pdfRichText.js';
import { toRichHtml } from './richText.js';
import { foregroundOn, hexToRgb } from './theme.js';

const { text, wrap, tableStyle, numeric, pageSize: { W, M, CW }, colors: { INK, BODY, MUTED } } = pdfKit;
const { newPage, footers, section, ensure, statTiles, specGrid, signOff } = pdfPage;

/** A data: image as jsPDF needs it, with its size. */
const loadLogo = (src) => new Promise((res) => {
  if (!src) return res(null);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    res({ data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
  };
  img.onerror = () => res(null);
  img.src = src;
});

/** A typed number as it reads best: 9, 2.5, 1,250 (no trailing zeros). */
const plain = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const dateText = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/**
 * Build the proposal. `data` = { company, client, system, items, pricing, terms, design }, `logo` a data: image,
 * `refNo` the saved proposal's reference. `save: false` only builds it (the on-page preview).
 */
export async function buildFreeProposalPdf({ data, logo = '', refNo = '', save = true }) {
  const { company = {}, client = {}, system = {}, items = [], pricing = {}, terms = {}, design = {} } = data;
  const currency = pricing.currency || 'INR';
  const money = (v, d = 0) => formatMoney(v, currency, { pdf: true, decimals: d });
  const totals = proposalTotals(items, pricing);
  const fin = proposalSavings(system, totals.net || totals.total);
  const now = new Date();
  const primary = /^#[0-9a-fA-F]{6}$/.test(design.primary || '') ? design.primary : '#1D4ED8';
  const accent = /^#[0-9a-fA-F]{6}$/.test(design.accent || '') ? design.accent : '#F5B82E';
  const brand = { branded: true, primary: hexToRgb(primary), primaryFg: hexToRgb(foregroundOn(primary)), accent: hexToRgb(accent), logo: await loadLogo(logo), signature: null, qr: null, paymentQr: null };
  const kwp = Number(system.kw) || 0;
  const count = Math.round(Number(system.panelCount) || 0);
  const acKwh = Number(system.annualKwh) || 0;
  const title = system.title || `${kwp} kW solar power system`;

  const r = {
    title,
    address: client.address || '',
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    validUntil: dateText(terms.validUntil),
    shareUrl: '',
    shareQr: '',
    dateShort: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    ref: `Ref. ${refNo || `SP-${now.toISOString().slice(0, 10).replace(/-/g, '')}`}`,
    totals: { kwp, count, acKwh },
    brand,
    company: { ...company, signatoryName: company.contactName },
    client: { name: '', ...client },
    calm: true,
    showBank: false, // the maker asks for payment terms as text, not for a bank account
  };
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${title} - Solar proposal`, author: company.name, subject: `Solar proposal for ${client.name || 'client'}`, creator: company.name });
  const table = () => tableStyle(doc, r);

  // 1 — cover: the design the visitor picked
  await drawCoverStyle(doc, r, { totals: r.totals, fin }, { currency }, null, design.cover);

  // 2 — summary
  let y = newPage(doc, r, 'Proposal summary');
  text(doc, client.name ? `Dear ${client.name},` : 'Dear Customer,', M, y + 2, { size: 11, style: 'bold', color: INK });
  const letter = [
    `Thank you for the opportunity to propose a solar power system${client.address ? ` for ${client.address}` : ''}.`,
    `We recommend a ${kwp} kW ${system.type ? `${system.type.toLowerCase()} ` : ''}system${count ? ` built with ${count} solar modules${system.panelWatts ? ` of ${system.panelWatts} W` : ''}` : ''}.`,
    acKwh ? `It is expected to generate about ${formatNumber(acKwh)} kWh of clean electricity every year${fin.firstYearSavings ? `, saving approximately ${money(fin.firstYearSavings)} in the first year` : ''}.` : '',
    'The price, what it includes and our terms are set out on the following page.',
  ].filter(Boolean).join(' ');
  const letterLines = wrap(doc, letter, CW, 9.5);
  text(doc, letterLines, M, y + 9.5, { size: 9.5, color: BODY, lineHeight: 1.5 });
  y += 9.5 + letterLines.length * 5.05 + 5;

  y = section(doc, r, 'Key figures', y);
  y = statTiles(doc, r, [
    ['System size', `${kwp} kW`, count ? `${count} modules${system.panelWatts ? ` x ${system.panelWatts} W` : ''}` : system.type || ''],
    acKwh ? ['Annual energy', `${formatNumber(acKwh)} kWh`, kwp ? `${formatNumber(acKwh / kwp)} kWh per kW` : ''] : null,
    ['Investment', money(totals.total), totals.subsidy > 0 ? `${money(totals.net)} after subsidy` : kwp ? `${money(totals.total / kwp)} per kW` : ''],
    fin.firstYearSavings ? ['Year-1 savings', money(fin.firstYearSavings), `at ${money(system.tariff, 2)} per kWh`] : null,
    fin.payback ? ['Payback', `${fin.payback.toFixed(1)} years`, 'simple payback'] : null,
    fin.firstYearSavings ? [`${fin.years}-year savings`, money(fin.lifetimeSavings), `net gain ${money(fin.netGain)}`] : null,
  ].filter(Boolean), y, { cols: 3 }) + 10;

  const spec = [
    ['System', title],
    ['Type', system.type],
    ['Capacity', `${kwp} kW`],
    ['Solar modules', [count ? `${count} x` : '', system.panelBrand, system.panelWatts ? `${system.panelWatts} W` : ''].filter(Boolean).join(' ')],
    ['Inverter', system.inverter],
    ['Mounting structure', system.structure],
    ['Warranty', system.warranty],
    ['Site', client.address],
  ].filter(([, v]) => String(v || '').trim());
  y = section(doc, r, 'Your system at a glance', ensure(doc, r, y, 30));
  y = specGrid(doc, spec, y) + 10;

  if (acKwh) {
    y = section(doc, r, 'Environmental benefit', ensure(doc, r, y, 36));
    const co2 = (acKwh * 0.7) / 1000;
    statTiles(doc, r, [
      ['CO2 avoided', `${co2.toFixed(1)} t / year`, `${formatNumber(co2 * fin.years)} t over ${fin.years} years`],
      ['Equivalent trees', formatNumber((co2 * 1000) / 21), 'planted and grown'],
      ['Clean energy', `${formatNumber((acKwh * fin.years) / 1000)} MWh`, `over ${fin.years} years`],
    ], y, { cols: 3 });
    text(doc, 'Estimated with a grid emission factor of 0.7 kg CO2 per kWh and 21 kg CO2 absorbed per tree per year.', M, y + 21 + 5, { size: 7, color: MUTED });
  }

  // 3 — price & acceptance
  y = newPage(doc, r, 'Price & acceptance');
  y = section(doc, r, `Price summary (${currency})`, y);
  const anyTax = items.some((it) => Number(it.taxPercent) > 0);
  autoTable(doc, {
    ...table(),
    startY: y,
    head: [['Item', 'Description', 'Qty', 'Rate', ...(anyTax ? ['Tax'] : []), 'Amount']],
    body: items.map((it) => [it.name, it.description || '', `${plain(it.qty)} ${it.unit || ''}`.trim(), money(it.rate), ...(anyTax ? [Number(it.taxPercent) > 0 ? `${plain(it.taxPercent)}%` : '-'] : []), money(lineAmount(it))]),
    ...numeric(...(anyTax ? [2, 3, 4, 5] : [2, 3, 4])),
    columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', textColor: INK }, 2: { halign: 'right', cellWidth: 22 }, 3: { halign: 'right', cellWidth: 26 }, ...(anyTax ? { 4: { halign: 'right', cellWidth: 18 }, 5: { halign: 'right', cellWidth: 28 } } : { 4: { halign: 'right', cellWidth: 28 } }) },
  });
  y = doc.lastAutoTable.finalY + 3;

  const lines = [];
  if (totals.discountAmount > 0 || totals.tax > 0) lines.push(['Subtotal', money(totals.subtotal)]);
  if (totals.discountAmount > 0) lines.push([`Discount${pricing.discountRemark ? ` - ${pricing.discountRemark}` : ''}`, money(-totals.discountAmount)]);
  if (totals.tax > 0) lines.push(['Tax', money(totals.tax)]);
  if (lines.length) {
    autoTable(doc, { ...table(), startY: y, body: lines, theme: 'plain', styles: { fontSize: 9.5, textColor: BODY }, columnStyles: { 0: { cellWidth: CW - 42 }, 1: { halign: 'right', cellWidth: 42 } } });
    y = doc.lastAutoTable.finalY + 3;
  }
  y = ensure(doc, r, y, 26);
  doc.setFillColor(...brand.primary);
  doc.rect(M, y, CW, 13, 'F');
  text(doc, totals.tax > 0 ? 'GRAND TOTAL (INCL. TAX)' : 'TOTAL INVESTMENT', M + 4, y + 8.2, { size: 8.5, style: 'bold', color: brand.primaryFg });
  text(doc, `${kwp} kW system`, M + 68, y + 8.2, { size: 8.5, color: brand.primaryFg });
  text(doc, money(totals.total), W - M - 4, y + 8.8, { size: 13, style: 'bold', color: brand.primaryFg, align: 'right' });
  y += 13;
  if (totals.subsidy > 0) {
    autoTable(doc, { ...table(), startY: y + 2, body: [['Less: subsidy', money(-totals.subsidy)], ['Net payable after subsidy', money(totals.net)]], theme: 'plain', styles: { fontSize: 9.5, textColor: BODY }, columnStyles: { 0: { cellWidth: CW - 42 }, 1: { halign: 'right', cellWidth: 42, fontStyle: 'bold', textColor: INK } } });
    y = doc.lastAutoTable.finalY;
  }
  y += 9;
  if (r.validUntil) {
    y = ensure(doc, r, y, 8);
    text(doc, `This proposal is valid until ${r.validUntil}.`, M, y, { size: 9.5, style: 'bold', color: INK });
    y += 8;
  }
  for (const [heading, body] of [['Payment terms', terms.payment], ['Terms & conditions', terms.conditions], ['Notes', terms.notes]]) {
    // typed in the rich text editor: headings, lists, bold/italic/underline, links, alignment
    const html = toRichHtml(body);
    if (richTextIsEmpty(html)) continue;
    y = section(doc, r, heading, ensure(doc, r, y, 20));
    y = drawRichText(doc, html, { x: M, y: y - 2.5, width: CW, size: 9, color: BODY, headingColor: INK, linkColor: brand.primary, markerColor: brand.primary, ensure: (yy, need) => ensure(doc, r, yy, need) }) + 7;
  }
  signOff(doc, r, y + 2);

  footers(doc, r);
  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `${[slug(client.name), slug(title)].filter(Boolean).join('_') || 'solar-proposal'}.pdf`;
  if (save) doc.save(filename);
  return { blob: doc.output('blob'), filename };
}

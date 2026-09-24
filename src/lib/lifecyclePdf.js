'use client';

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { loadBranding } from './branding.js';
import { describeLifecycleEvent } from './lifecycleLog.js';

const M = 16;
const W = 210;
const CW = W - 2 * M;

function fmt(d) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Chronological audit PDF from design start through installation. */
export async function generateLifecyclePdf({ lifecycle, company = {}, client = {} }) {
  const brand = await loadBranding(company);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const title = lifecycle.design?.name || 'Project history';
  doc.setProperties({ title: `${title} — activity log`, author: company.name || 'Solar' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brand.primary);
  doc.text('Project activity log', M, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(title, M, 30);
  if (client?.name) doc.text(`Client: ${client.name}`, M, 36);
  doc.text(`Generated ${fmt(new Date())}`, M, 42);
  doc.text('Events are listed oldest to newest.', M, 48);

  const rows = (lifecycle.events || []).map((e) => {
    const d = describeLifecycleEvent(e);
    const who = d.who ? `${d.who} — ` : '';
    const extra = [d.detail, d.note].filter(Boolean).join(' · ');
    const loc = e.lat != null && e.lng != null ? `Location: ${Number(e.lat).toFixed(5)}, ${Number(e.lng).toFixed(5)}` : '';
    const photo = e.imageUrl ? 'Photo attached' : '';
    return [fmt(e.at), d.phase, `${who}${d.text}`, [extra, loc, photo].filter(Boolean).join('\n')];
  });

  autoTable(doc, {
    startY: 54,
    head: [['Date & time', 'Phase', 'Event', 'Details']],
    body: rows.length ? rows : [['—', '—', 'No recorded events yet', '']],
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85] },
    headStyles: { fillColor: brand.primary, textColor: brand.primaryFg || [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 24 },
      2: { cellWidth: 52 },
      3: { cellWidth: CW - 108 },
    },
  });

  const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`${slug(title) || 'project'}-activity-log.pdf`);
}

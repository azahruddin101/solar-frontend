'use client';

// Renders editor HTML (see components/kit/RichTextEditor.js) into a jsPDF document:
// paragraphs, h2/h3, blockquotes, nested ordered / bullet lists, indents, alignment, line breaks,
// and inline bold / italic / underline / strike / links — with word wrapping and page breaks.

import { toRichHtml } from './richText.js';

const PT = 0.3528; // millimetres per point
const INDENT = 5; // mm per indent level
const MARKER = 6; // mm reserved for a list number / bullet

const SIZES = { h2: 11, h3: 9.5 };
const fontStyle = (r) => (r.bold && r.italic ? 'bolditalic' : r.bold ? 'bold' : r.italic ? 'italic' : 'normal');

// The built-in PDF fonts only cover Windows-1252. Swap what has an obvious stand-in, drop the rest.
const REPLACE = { '₹': 'Rs. ', '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '≈': '~', '✓': '', '✔': '', '\u2011': '-', '\u2212': '-', '\u00a0': ' ', '\u200b': '' }; // non-breaking hyphen, minus, nbsp, zero-width space
const WIN_1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function printable(text) {
  let out = '';
  for (const ch of text) {
    if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (ch.charCodeAt(0) <= 0xff || WIN_1252_EXTRA.includes(ch)) out += ch;
    else out += '?';
  }
  return out;
}

const alpha = (n) => String.fromCharCode(96 + ((n - 1) % 26) + 1);
const roman = (n) => [['x', 10], ['ix', 9], ['v', 5], ['iv', 4], ['i', 1]].reduce((acc, [s, v]) => { while (n >= v) { acc += s; n -= v; } return acc; }, '');
const ordinal = (n, level) => `${[String(n), alpha(n), roman(n)][level % 3]}.`;

const classIndent = (el) => Number(/ql-indent-(\d)/.exec(el.className || '')?.[1] || 0);
const alignOf = (el) => /ql-align-(center|right|justify)/.exec(el.className || '')?.[1] || 'left';

/** HTML → flat list of blocks: { kind, align, indent, marker, runs: [{text, bold, italic, underline, strike, href} | {br}] }. */
export function parseRichText(html) {
  if (!html || typeof DOMParser === 'undefined') return [];
  const body = new DOMParser().parseFromString(`<body>${toRichHtml(html)}</body>`, 'text/html').body; // inert document: nothing executes
  const blocks = [];

  const inline = (node, style, runs) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const text = printable(child.nodeValue).replace(/\s+/g, ' '); // collapse after substitution ("₹ 500" → "Rs. 500")
        if (text) runs.push({ ...style, text });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') runs.push({ br: true });
      else if (tag === 'ol' || tag === 'ul') continue; // nested lists are handled as their own blocks
      else {
        const href = tag === 'a' ? child.getAttribute('href') : style.href;
        inline(child, { bold: style.bold || tag === 'strong' || tag === 'b', italic: style.italic || tag === 'em' || tag === 'i', underline: style.underline || tag === 'u', strike: style.strike || tag === 's', href: /^(https?:|mailto:|tel:)/i.test(href || '') ? href : undefined }, runs);
      }
    }
    return runs;
  };

  const list = (el, depth) => {
    const ordered = el.tagName.toLowerCase() === 'ol';
    const counters = {};
    for (const li of el.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      const level = depth + classIndent(li);
      // Quill's own markup is <ol><li data-list="bullet">; semantic HTML uses real <ul>
      const isOrdered = li.getAttribute('data-list') ? li.getAttribute('data-list') === 'ordered' : ordered;
      for (const k of Object.keys(counters)) if (Number(k) > level) delete counters[k];
      counters[level] = (counters[level] || 0) + 1;
      blocks.push({ kind: 'li', align: alignOf(li), indent: level, marker: isOrdered ? ordinal(counters[level], level) : { bullet: level % 3 }, runs: inline(li, {}, []) });
      for (const nested of li.children) if (/^(ol|ul)$/i.test(nested.tagName)) list(nested, level + 1);
    }
  };

  for (const el of body.children) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'ol' || tag === 'ul') list(el, 0);
    else blocks.push({ kind: ['h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p', align: alignOf(el), indent: classIndent(el), runs: inline(el, {}, []) });
  }
  // loose text without a wrapping element
  if (!blocks.length && body.textContent.trim()) blocks.push({ kind: 'p', align: 'left', indent: 0, runs: inline(body, {}, []) });
  return blocks;
}

export const richTextIsEmpty = (html) => !parseRichText(html).some((b) => b.runs.some((r) => r.text?.trim()));

/** Break a block's runs into lines of measured segments that fit `width`. */
function layout(doc, block, width, size) {
  const heading = block.kind === 'h2' || block.kind === 'h3';
  const lines = [[]];
  let used = 0;
  const push = (seg) => {
    lines[lines.length - 1].push(seg);
    used += seg.w;
  };
  const newLine = () => {
    lines.push([]);
    used = 0;
  };
  for (const run of block.runs) {
    if (run.br) {
      newLine();
      continue;
    }
    const style = { ...run, bold: run.bold || heading, italic: run.italic || block.kind === 'blockquote' };
    doc.setFont('helvetica', fontStyle(style));
    doc.setFontSize(size);
    for (const token of run.text.split(/( )/)) {
      if (!token) continue;
      if (token === ' ') {
        if (used > 0) push({ ...style, text: ' ', w: doc.getTextWidth(' '), space: true });
        continue;
      }
      let word = token;
      let w = doc.getTextWidth(word);
      if (used > 0 && used + w > width) newLine();
      // a single word wider than the column (long URL): split it by characters
      while (w > width && word.length > 1) {
        let n = word.length - 1;
        while (n > 1 && doc.getTextWidth(word.slice(0, n)) > width) n--;
        push({ ...style, text: word.slice(0, n), w: doc.getTextWidth(word.slice(0, n)) });
        newLine();
        word = word.slice(n);
        w = doc.getTextWidth(word);
      }
      push({ ...style, text: word, w });
    }
  }
  // trailing spaces must not count when centring / right-aligning
  return lines.map((segs) => {
    while (segs.length && segs[segs.length - 1].space) segs.pop();
    return { segs, width: segs.reduce((a, s) => a + s.w, 0) };
  });
}

function drawMarker(doc, marker, x, y, size, color) {
  if (typeof marker === 'string') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(marker, x + MARKER - 1.6, y, { align: 'right' });
    return;
  }
  const cy = y - size * PT * 0.32;
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.25);
  if (marker.bullet === 0) doc.circle(x + 2.2, cy, 0.65, 'F');
  else if (marker.bullet === 1) doc.circle(x + 2.2, cy, 0.6, 'S');
  else doc.rect(x + 1.65, cy - 0.55, 1.1, 1.1, 'F');
}

/**
 * Draw `html` starting at (x, y) within `width`. `ensure(y, need)` must return a y that has `need`
 * millimetres free (adding a page when necessary). Returns the y below the last line.
 */
export function drawRichText(doc, html, { x, y, width, size = 8.5, color = [51, 65, 85], headingColor = [15, 23, 42], linkColor = [29, 78, 216], markerColor = linkColor, ensure = (yy) => yy }) {
  const blocks = parseRichText(html);
  blocks.forEach((block, i) => {
    const fs = SIZES[block.kind] || size;
    const lineH = fs * PT * 1.42;
    const indent = block.indent * INDENT + (block.kind === 'li' ? MARKER : 0) + (block.kind === 'blockquote' ? 4 : 0);
    const bx = x + indent;
    const bw = Math.max(20, width - indent);
    const empty = !block.runs.some((r) => r.text?.trim());

    if (i > 0) y += block.kind === 'h2' ? 3.2 : block.kind === 'h3' ? 2.6 : block.kind === 'li' && blocks[i - 1].kind === 'li' ? 0.9 : 1.7;
    if (empty) {
      y += lineH * 0.6; // an empty paragraph is a deliberate gap
      return;
    }

    const lines = layout(doc, block, bw, fs);
    // keep a heading together with the first line that follows it
    y = ensure(y, block.kind === 'h2' || block.kind === 'h3' ? lineH * 2 + 3 : lineH);
    const top = y;
    lines.forEach((line, n) => {
      if (n > 0) y = ensure(y, lineH);
      const baseline = y + fs * PT * 0.85;
      if (n === 0 && block.kind === 'li') drawMarker(doc, block.marker, x + block.indent * INDENT, baseline, fs, markerColor);
      let cx = block.align === 'center' ? bx + (bw - line.width) / 2 : block.align === 'right' ? bx + bw - line.width : bx;
      for (const seg of line.segs) {
        const c = seg.href ? linkColor : block.kind === 'h2' || block.kind === 'h3' ? headingColor : color;
        // spaces are drawn too, so text copied out of the PDF keeps its word breaks
        doc.setFont('helvetica', fontStyle(seg));
        doc.setFontSize(fs);
        doc.setTextColor(...c);
        doc.text(seg.text, cx, baseline);
        if (seg.underline || seg.strike || seg.href) {
          doc.setDrawColor(...c);
          doc.setLineWidth(fs * 0.022);
          if (seg.underline || seg.href) doc.line(cx, baseline + 0.55, cx + seg.w, baseline + 0.55);
          if (seg.strike) doc.line(cx, baseline - fs * PT * 0.3, cx + seg.w, baseline - fs * PT * 0.3);
        }
        if (seg.href) doc.link(cx, y, seg.w, lineH, { url: seg.href });
        cx += seg.w;
      }
      y += lineH;
    });
    if (block.kind === 'blockquote') {
      doc.setFillColor(...markerColor);
      doc.rect(x + block.indent * INDENT, top, 0.8, Math.max(lineH, y - top), 'F');
    }
  });
  return y;
}

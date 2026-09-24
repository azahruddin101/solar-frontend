// Shared by the editor and the PDF renderer.

const IS_HTML = /<\/?(p|br|div|ol|ul|li|h[1-6]|blockquote|strong|b|em|i|u|s|a)(\s[^>]*)?\/?>/i;
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Terms saved before the rich text editor were plain text, one point per line → numbered list. */
export function toRichHtml(value) {
  const v = value || '';
  if (IS_HTML.test(v)) return v;
  const lines = v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? `<ol>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ol>` : '';
}

const ALLOWED_TAGS = new Set(['P', 'BR', 'H2', 'H3', 'BLOCKQUOTE', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'OL', 'UL', 'LI', 'A']);
const ALLOWED_CLASS = /^ql-(align-(center|right|justify)|indent-[1-8])$/;
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/**
 * Keeps only the formatting the terms editor produces (the same allow-list the server applies before saving). Used on
 * everything that leaves or enters the editor, so markup that should not be there is dropped before it is stored or shown.
 */
export function sanitizeRichHtml(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'); // an inert document: nothing in it runs
  const clean = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue; // text
      if (child.nodeType !== 1) { child.remove(); continue; } // comments etc.
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // scripts and styles disappear with their content; other unknown tags keep their text
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'].includes(child.tagName)) child.remove();
        else { clean(child); child.replaceWith(...child.childNodes); }
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (child.tagName === 'A' && name === 'href' && SAFE_HREF.test(attr.value.trim())) continue;
        if (child.tagName === 'A' && (name === 'target' || name === 'rel')) continue;
        if (name === 'class') {
          const kept = attr.value.split(/\s+/).filter((c) => ALLOWED_CLASS.test(c));
          if (kept.length) { child.setAttribute('class', kept.join(' ')); continue; }
        }
        child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      clean(child);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

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

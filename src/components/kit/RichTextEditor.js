'use client';

// Rich text editor (Quill 2) for proposal text. Value in / out is semantic HTML
// (<p>, <h3>, <ol>/<ul>, <strong>…); the backend sanitises it again on save.
// Quill's stylesheet is imported in app/dashboard/layout.js; the look is tuned in globals.css.
import { useEffect, useRef, useState } from 'react';
import { toRichHtml } from '@/lib/richText';
import { cx } from './index';

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }, { indent: '-1' }, { indent: '+1' }],
  [{ align: [] }],
  ['link', 'clean'],
];
const FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'list', 'indent', 'align', 'link'];

export default function RichTextEditor({ value, onChange, placeholder, maxLength = 6000, minHeight = 220, className, 'aria-label': ariaLabel }) {
  const host = useRef(null);
  const quill = useRef(null);
  const onChangeRef = useRef(onChange);
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    import('quill').then(({ default: Quill }) => {
      if (cancelled || !el) return;
      const editorEl = document.createElement('div');
      el.appendChild(editorEl);
      const q = new Quill(editorEl, { theme: 'snow', placeholder, formats: FORMATS, modules: { toolbar: TOOLBAR } });
      q.root.setAttribute('aria-label', ariaLabel || 'Rich text');
      q.clipboard.dangerouslyPasteHTML(toRichHtml(value), 'silent'); // Quill keeps only FORMATS, so pasted HTML cannot inject markup
      q.history.clear();
      const length = () => Math.max(0, q.getLength() - 1);
      setCount(length());
      q.on('text-change', (delta, old, source) => {
        if (length() > maxLength) q.deleteText(maxLength, q.getLength(), 'silent');
        setCount(length());
        if (source === 'silent') return;
        // getSemanticHTML writes real <ul>/<ol> (Quill's own DOM uses <ol data-list>) and pads with &nbsp;
        onChangeRef.current?.(length() ? q.getSemanticHTML().replace(/&nbsp;| /g, ' ') : '');
      });
      quill.current = q;
      setReady(true);
    });
    return () => {
      cancelled = true;
      quill.current = null;
      if (el) el.innerHTML = ''; // removes the toolbar Quill inserted next to the editor
    };
    // the editor is uncontrolled after mount: `value` seeds it once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cx('rich-editor', className)} style={{ '--editor-min-height': `${minHeight}px` }}>
      <div ref={host} className={cx(!ready && 'animate-pulse rounded-lg border border-slate-300 bg-slate-50')} style={ready ? undefined : { minHeight: minHeight + 42 }} />
      <div className={cx('mt-1.5 text-right text-xs tabular-nums', count >= maxLength ? 'text-red-600' : 'text-slate-400')}>{count.toLocaleString()} / {maxLength.toLocaleString()}</div>
    </div>
  );
}

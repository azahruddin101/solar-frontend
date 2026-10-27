'use client';

import { useMemo } from 'react';
import { sanitizeRichHtml, toRichHtml } from '@/lib/richText';
import { richTextIsEmpty } from '@/lib/pdfRichText';
import { cx } from './index';

/** Read-only HTML from the rich text editor (sanitised before render). */
export default function RichTextContent({ html, className }) {
  const safe = useMemo(() => {
    if (richTextIsEmpty(html)) return '';
    return sanitizeRichHtml(toRichHtml(html));
  }, [html]);
  if (!safe) return null;
  return <div className={cx('rich-content', className)} dangerouslySetInnerHTML={{ __html: safe }} />;
}

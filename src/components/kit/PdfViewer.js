'use client';

import { Download, X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { cx } from './cx';

const usePdfViewer = create((set, get) => ({
  item: null,
  open: (item) => {
    const prev = get().item;
    if (prev?.revoke && prev.src) URL.revokeObjectURL(prev.src);
    set({ item });
  },
  close: () => {
    const prev = get().item;
    if (prev?.revoke && prev.src) URL.revokeObjectURL(prev.src);
    set({ item: null });
  },
}));

/** Show a PDF in a full-screen modal (`blob` or absolute `src` URL). `downloadSrc`: a link that downloads it, if not `src`. */
export function openPdfViewer({ title = 'Document', blob, src, downloadSrc, downloadName }) {
  if (blob) {
    usePdfViewer.getState().open({
      title,
      src: URL.createObjectURL(blob),
      revoke: true,
      downloadName: downloadName || `${title}.pdf`,
    });
    return;
  }
  if (src) {
    usePdfViewer.getState().open({ title, src, downloadSrc, revoke: false, downloadName: downloadName || `${title}.pdf` });
  }
}

/** Mounted once in the root layout. */
export function PdfViewerHost() {
  const { item, close } = usePdfViewer();

  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, close]);

  if (!item || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-[100] flex animate-fade flex-col bg-slate-950/85 backdrop-blur-sm"
      onClick={close}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
        <div className="flex items-center gap-1">
          <a
            href={item.downloadSrc || item.src}
            download={item.downloadName}
            target="_blank"
            rel="noreferrer"
            aria-label="Download PDF"
            title="Download"
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-5 w-5" />
          </a>
          <button type="button" autoFocus aria-label="Close" title="Close (Esc)" onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 p-4 pt-0" onClick={(e) => e.stopPropagation()}>
        <iframe title={item.title} src={item.src} className={cx('h-full w-full animate-pop rounded-lg border-0 bg-white shadow-2xl')} />
      </div>
    </div>,
    document.body,
  );
}

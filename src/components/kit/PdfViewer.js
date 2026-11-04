'use client';

import { Download, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

/** Open the viewer shell immediately while the PDF is fetched or generated. */
export function openPdfViewerLoading(title = 'Document') {
  usePdfViewer.getState().open({ title, loading: true });
}

export function closePdfViewer() {
  usePdfViewer.getState().close();
}

/** Show a PDF in a full-screen modal (`blob` or absolute `src` URL). `downloadSrc`: a link that downloads it, if not `src`. */
export function openPdfViewer({ title = 'Document', blob, src, downloadSrc, downloadName }) {
  if (blob) {
    usePdfViewer.getState().open({
      title,
      src: URL.createObjectURL(blob),
      revoke: true,
      downloadName: downloadName || `${title}.pdf`,
      loading: false,
    });
    return;
  }
  if (src) {
    usePdfViewer.getState().open({ title, src, downloadSrc, revoke: false, downloadName: downloadName || `${title}.pdf`, loading: false });
  }
}

/** Mounted once in the root layout. */
export function PdfViewerHost() {
  const { item, close } = usePdfViewer();
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    setFrameReady(false);
  }, [item?.src, item?.loading]);

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

  const ready = !item.loading && item.src && frameReady;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      aria-busy={!ready}
      className="fixed inset-0 z-[100] flex animate-fade flex-col bg-slate-950/85 backdrop-blur-sm"
      onClick={close}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
        <div className="flex items-center gap-1">
          {item.src && !item.loading && (
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
          )}
          <button type="button" autoFocus aria-label="Close" title="Close (Esc)" onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 p-4 pt-0" onClick={(e) => e.stopPropagation()}>
        {!ready && (
          <div className="absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-lg bg-white/95 text-slate-600 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
            <p className="text-sm font-medium">Preparing PDF…</p>
          </div>
        )}
        {item.src && !item.loading && (
          <iframe
            title={item.title}
            src={item.src}
            onLoad={() => setFrameReady(true)}
            className={cx('h-full w-full rounded-lg border-0 bg-white shadow-2xl', ready && 'animate-pop')}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

'use client';

// Real upload progress: the bytes the browser has sent (api(…, { form, onProgress })), across one or several files.
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { cx } from './cx';

const mb = (bytes) => {
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

/**
 * Uploads files one after another and keeps their combined progress. `run(files, send)` calls
 * `send(file, { onProgress, signal })` for each (pass both on to api()) and resolves with how many were sent; on a failure
 * the error carries `uploaded` (how many got through first). `cancel()` stops the upload under way.
 */
export function useUploadQueue() {
  const [progress, setProgress] = useState(null);
  const controller = useRef(null);

  const run = async (files, send) => {
    const ctrl = new AbortController();
    controller.current = ctrl;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0) || 1;
    let before = 0; // bytes of the files already uploaded
    let uploaded = 0;
    try {
      for (const [index, file] of files.entries()) {
        const size = file.size || 0;
        setProgress({ index, count: files.length, name: file.name, sent: before, totalSize, saving: false });
        await send(file, {
          signal: ctrl.signal,
          onProgress: ({ loaded, total }) => {
            const part = total ? Math.min(1, loaded / total) : 1;
            // every byte is up: the server is now storing the file
            setProgress((p) => p && { ...p, sent: before + part * size, saving: part >= 1 });
          },
        });
        before += size;
        uploaded += 1;
      }
    } catch (e) {
      e.uploaded = uploaded;
      throw e;
    } finally {
      controller.current = null;
      setProgress(null);
    }
    return uploaded;
  };

  return { progress, run, cancel: () => controller.current?.abort() };
}

/** The bar for `useUploadQueue().progress`. Cancel is offered until the last byte is sent (after that the server keeps it). */
export function UploadProgress({ progress, onCancel, className }) {
  if (!progress) return null;
  const { index, count, name, sent, totalSize, saving } = progress;
  const percent = Math.min(100, Math.round((sent / totalSize) * 100));
  return (
    <div className={cx('rounded-lg border border-slate-200 bg-white px-3 py-2.5', className)}>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="min-w-0 flex-1 truncate text-slate-700">
          {count > 1 && <span className="text-slate-500">{index + 1} of {count} · </span>}
          {name}
        </span>
        <span className="shrink-0 font-medium text-slate-900 tabular-nums">{percent}%</span>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} aria-label="Cancel upload" title={saving ? 'Already sent — finishing' : 'Cancel upload'} className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div role="progressbar" aria-label={`Uploading ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500 tabular-nums">
        {saving ? `${count > 1 ? `File ${index + 1} sent` : 'Sent'} — saving…` : `${mb(sent)} of ${mb(totalSize)}`}
      </p>
    </div>
  );
}

'use client';

import { Paperclip, Send, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { CameraButton, Button, cx } from '../kit';
import { fmtSize } from './shared';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/** Thumbnails / chips of the files chosen so far. */
function Chosen({ files, setFiles }) {
  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="group relative">
          {previews[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previews[i]} alt={f.name} className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
          ) : (
            <span className="flex h-16 w-40 flex-col justify-center rounded-lg bg-slate-50 px-2.5 ring-1 ring-slate-200">
              <span className="truncate text-xs font-medium text-slate-700">{f.name}</span>
              <span className="text-[11px] text-slate-400">{fmtSize(f.size)}</span>
            </span>
          )}
          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-800 text-white shadow hover:bg-red-600"><X className="h-3 w-3" /></button>
        </li>
      ))}
    </ul>
  );
}

/** Attach button + camera + the chosen files. Enforces the same limits as the API. */
function Attach({ files, setFiles, disabled }) {
  const input = useRef(null);
  const add = (list) => {
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) break;
      if (f.size <= MAX_BYTES) next.push(f);
    }
    setFiles(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <Button size="sm" icon={Paperclip} disabled={disabled || files.length >= MAX_FILES} onClick={() => input.current?.click()}>Attach image / PDF</Button>
        <CameraButton disabled={disabled || files.length >= MAX_FILES} onFile={(f) => add([f])} />
      </div>
      <Chosen files={files} setFiles={setFiles} />
    </div>
  );
}

/** Reply box: grows with the text, attach + camera as icon buttons, Ctrl/⌘+Enter sends. */
export default function Composer({ text, setText, files, setFiles, busy, onSend, disabled }) {
  const box = useRef(null);
  const input = useRef(null);
  const ready = (text.trim() || files.length) && !busy && !disabled;
  const off = busy || disabled;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const add = (list) => {
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) break;
      if (f.size <= MAX_BYTES) next.push(f);
    }
    setFiles(next);
  };

  return (
    <div className={cx('rounded-2xl border bg-white transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10', off ? 'border-slate-200 opacity-70' : 'border-slate-300')}>
      {files.length > 0 && <div className="px-3 pt-3"><Chosen files={files} setFiles={setFiles} /></div>}
      <textarea
        ref={box}
        rows={1}
        value={text}
        maxLength={4000}
        disabled={off}
        placeholder="Write a message…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (ready) onSend(); } }}
        className="block max-h-40 min-h-[44px] w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <div className="flex items-center gap-1">
          <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(e) => { add(Array.from(e.target.files || [])); e.target.value = ''; }} />
          <button type="button" aria-label="Attach an image or PDF" title="Attach an image or PDF" disabled={off || files.length >= MAX_FILES} onClick={() => input.current?.click()} className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"><Paperclip className="h-[18px] w-[18px]" /></button>
          <CameraButton size="sm" disabled={off || files.length >= MAX_FILES} onFile={(f) => add([f])} label="Camera" className="!border-0 !bg-transparent !shadow-none !ring-0 text-slate-500 hover:!bg-slate-100" />
          <span className="ml-1 hidden text-[11px] text-slate-400 sm:inline">Ctrl/⌘ + Enter to send</span>
        </div>
        <Button variant="primary" icon={Send} loading={busy} disabled={!ready} onClick={onSend} className="rounded-full">Send</Button>
      </div>
    </div>
  );
}
Composer.Attach = Attach;

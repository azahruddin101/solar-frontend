import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-slate-400">404</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">This page doesn’t exist</h1>
        <p className="mt-2 text-sm text-slate-500">The link may be old, or the record may have been removed.</p>
        <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">Go home</Link>
      </div>
    </main>
  );
}

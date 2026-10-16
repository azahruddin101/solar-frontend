'use client'; // error boundaries must be client components

import { useEffect } from 'react';

export default function ErrorPage({ error, retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="grid min-h-[60dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">The page hit an unexpected error. Try again; if it keeps happening, contact support.</p>
        <button type="button" onClick={() => retry()} className="mt-6 inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800">Try again</button>
      </div>
    </main>
  );
}

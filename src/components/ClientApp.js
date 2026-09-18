'use client';

import dynamic from 'next/dynamic';

// The planner is fully client-side (Google Maps, WebGL, localStorage), so skip SSR.
const App = dynamic(() => import('./App'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-slate-50 text-sm text-slate-500">Loading…</div>,
});

export default function ClientApp({ slug }) {
  return <App slug={slug} />;
}

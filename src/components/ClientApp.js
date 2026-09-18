'use client';

import dynamic from 'next/dynamic';

// The planner is fully client-side (Google Maps, WebGL, localStorage), so skip SSR.
const App = dynamic(() => import('./App'), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-slate-900 text-sm text-slate-400">Loading planner…</div>
  ),
});

export default function ClientApp() {
  return <App />;
}

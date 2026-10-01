'use client';

import dynamic from 'next/dynamic';
import { FullPageLoader } from './kit';
import AuthGuard from './layout/AuthGuard';

// The designer is fully client-side (Google Maps, WebGL), so skip SSR.
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <FullPageLoader /> });

export default function ClientApp({ designId, slug }) {
  return (
    <AuthGuard role={['company', 'agent']} permission="designs:view">
      <App designId={designId} slug={slug} />
    </AuthGuard>
  );
}

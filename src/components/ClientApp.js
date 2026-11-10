'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { FullPageLoader } from './kit';
import AuthGuard from './layout/AuthGuard';

// The designer is fully client-side (Google Maps, WebGL), so skip SSR.
const App = dynamic(() => import('./App'), { ssr: false, loading: () => <FullPageLoader /> });

export default function ClientApp({ designId }) {
  const slug = useParams()?.step; // the step part of /design/<id>/<step>
  return (
    // the branch owner (role branch), the company admin working in a branch (role company), and staff
    <AuthGuard role={['branch', 'company', 'agent']} permission="proposals:view">
      <App designId={designId} slug={slug} />
    </AuthGuard>
  );
}

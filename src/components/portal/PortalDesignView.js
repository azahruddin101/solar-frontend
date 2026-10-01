'use client';

import dynamic from 'next/dynamic';
import { FullPageLoader } from '../kit';
import AuthGuard from '../layout/AuthGuard';

// The 3D scene is fully client-side (WebGL), so skip SSR — same as the designer.
const Viewer = dynamic(() => import('./DesignViewer'), { ssr: false, loading: () => <FullPageLoader /> });

/** A client's view-only 3D of their own proposal. */
export default function PortalDesignView({ id }) {
  return (
    <AuthGuard role="client">
      <Viewer id={id} />
    </AuthGuard>
  );
}

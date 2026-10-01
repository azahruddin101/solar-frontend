'use client';

import dynamic from 'next/dynamic';
import { FullPageLoader } from '../kit';

// The 3D scene is fully client-side (WebGL) — same viewer the client portal uses, opened here without a sign-in.
const Viewer = dynamic(() => import('../portal/DesignViewer'), { ssr: false, loading: () => <FullPageLoader /> });

export default function PublicDesignView({ token }) {
  return <Viewer token={token} />;
}

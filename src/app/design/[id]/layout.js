import { Suspense } from 'react';
import ClientApp from '@/components/ClientApp';

export const metadata = { title: 'Designer · SolarDesy' };

// The designer lives in the layout, not the step page: a layout stays mounted while the URL moves
// between /design/<id>/<step> pages, so changing steps keeps the same 3D scene (no reload). The
// step is read from the URL inside the client app.
export default async function DesignLayout({ params, children }) {
  const { id } = await params;
  return (
    <>
      <Suspense>
        <ClientApp designId={id} />
      </Suspense>
      {children}
    </>
  );
}

import { Suspense } from 'react';
import ClientApp from '@/components/ClientApp';

export const metadata = { title: 'Designer · Innovbit' };

export default async function Page({ params }) {
  const { id, step } = await params;
  return (
    <Suspense>
      <ClientApp designId={id} slug={step} />
    </Suspense>
  );
}

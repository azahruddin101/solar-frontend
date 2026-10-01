import { Suspense } from 'react';
import Clients from '@/components/dashboard/Clients';

export default function Page() {
  return (
    <Suspense>
      <Clients basePath="/agent/clients" />
    </Suspense>
  );
}

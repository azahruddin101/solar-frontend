import { Suspense } from 'react';
import Designs from '@/components/dashboard/Designs';

export default function Page() {
  return (
    <Suspense>
      <Designs basePath="/agent/designs" installationsBasePath="/agent/installations" billingBasePath="/agent/billing" clientsBasePath="/agent/clients" />
    </Suspense>
  );
}

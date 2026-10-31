import { Suspense } from 'react';
import Billing from '@/components/dashboard/Billing';

export default function Page() {
  return (
    <Suspense>
      <Billing basePath="/agent/billing" />
    </Suspense>
  );
}

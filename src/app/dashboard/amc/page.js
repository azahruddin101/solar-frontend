import { Suspense } from 'react';
import { CompanyAmc } from '@/components/dashboard/AmcTracker';

export default function Page() {
  return (
    <Suspense>
      <CompanyAmc />
    </Suspense>
  );
}

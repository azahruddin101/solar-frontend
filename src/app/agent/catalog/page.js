import { Suspense } from 'react';
import Catalog from '@/components/dashboard/Catalog';

export default function Page() {
  return (
    <Suspense>
      <Catalog mastersPath="/agent/masters?tab=catalog-categories" />
    </Suspense>
  );
}

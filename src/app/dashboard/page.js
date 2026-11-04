import { Suspense } from 'react';
import Overview from '@/components/dashboard/Overview';

export default function Page() {
  return (
    <Suspense>
      <Overview />
    </Suspense>
  );
}

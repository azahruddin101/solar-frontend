import { Suspense } from 'react';
import OverviewClassic from '@/components/dashboard/OverviewClassic';

// The previous dashboard, unchanged, for comparison and the full team report.
export default function Page() {
  return (
    <Suspense>
      <OverviewClassic />
    </Suspense>
  );
}

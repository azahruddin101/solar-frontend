import { Suspense } from 'react';
import Overview from '@/components/dashboard/Overview';
import OverviewClassic from '@/components/dashboard/OverviewClassic';

// Set to true to put the previous dashboard back on /dashboard. It is always at /dashboard/classic.
const USE_CLASSIC_DASHBOARD = false;

export default function Page() {
  return <Suspense>{USE_CLASSIC_DASHBOARD ? <OverviewClassic /> : <Overview />}</Suspense>;
}

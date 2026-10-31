import { Suspense } from 'react';
import AllLeads from '@/components/leads/AllLeads';

// Staff: every lead they may see, from all sources; the source tabs inside the page narrow it.
export default function Page() {
  return (
    <Suspense>
      <AllLeads />
    </Suspense>
  );
}

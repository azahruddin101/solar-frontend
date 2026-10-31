import { Suspense } from 'react';
import AllLeads from '@/components/leads/AllLeads';

export default function Page() {
  return (
    <Suspense>
      <AllLeads />
    </Suspense>
  );
}

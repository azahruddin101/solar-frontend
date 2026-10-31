import { Suspense } from 'react';
import LeadBoard from '@/components/leads/LeadBoard';

// Meta leads as a board, fixed to that source (the switch on the Meta leads page leads here).
export default function Page() {
  return (
    <Suspense>
      <LeadBoard />
    </Suspense>
  );
}

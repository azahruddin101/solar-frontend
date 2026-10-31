import { Suspense } from 'react';
import LeadBoard from '@/components/leads/LeadBoard';

// Staff: the leads they may see, as a board; moving a card follows their "change status" permission.
export default function Page() {
  return (
    <Suspense>
      <LeadBoard />
    </Suspense>
  );
}

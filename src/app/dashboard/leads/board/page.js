import { Suspense } from 'react';
import LeadBoard from '@/components/leads/LeadBoard';

export default function Page() {
  return (
    <Suspense>
      <LeadBoard />
    </Suspense>
  );
}

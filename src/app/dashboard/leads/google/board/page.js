import { Suspense } from 'react';
import LeadBoard from '@/components/leads/LeadBoard';

// Google Ads leads as a board, fixed to that source (the switch on the Google Ads leads page leads here).
export default function Page() {
  return (
    <Suspense>
      <LeadBoard />
    </Suspense>
  );
}

import { Suspense } from 'react';
import StepBoard from '@/components/installations/StepBoard';

// Staff: the steps of the installations they are on; only their own steps move.
export default function Page() {
  return (
    <Suspense>
      <StepBoard basePath="/agent/installations" />
    </Suspense>
  );
}

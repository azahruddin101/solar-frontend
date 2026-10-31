import { Suspense } from 'react';
import StepBoard from '@/components/installations/StepBoard';

export default function Page() {
  return (
    <Suspense>
      <StepBoard />
    </Suspense>
  );
}

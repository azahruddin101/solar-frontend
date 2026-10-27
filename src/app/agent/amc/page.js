import { Suspense } from 'react';
import { AgentAmc } from '@/components/dashboard/AmcTracker';

export default function Page() {
  return (
    <Suspense>
      <AgentAmc />
    </Suspense>
  );
}

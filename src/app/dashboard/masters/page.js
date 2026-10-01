import { Suspense } from 'react';
import Masters from '@/components/dashboard/Masters';

export default function Page() {
  return (
    <Suspense>
      <Masters />
    </Suspense>
  );
}

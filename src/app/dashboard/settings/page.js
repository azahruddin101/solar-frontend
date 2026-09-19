import { Suspense } from 'react';
import Settings from '@/components/dashboard/Settings';

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

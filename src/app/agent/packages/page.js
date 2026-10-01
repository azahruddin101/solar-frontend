import { Suspense } from 'react';
import Packages from '@/components/dashboard/Packages';

export default function Page() {
  return (
    <Suspense>
      <div className="space-y-6">
        <Packages />
      </div>
    </Suspense>
  );
}

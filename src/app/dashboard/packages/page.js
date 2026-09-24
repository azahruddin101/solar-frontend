import { Suspense } from 'react';
import Packages from '@/components/dashboard/Packages';

export const metadata = {
  title: 'Packages · Innovbit Solar',
};

export default function Page() {
  return (
    <Suspense>
      <div className="space-y-6">
        <Packages />
      </div>
    </Suspense>
  );
}

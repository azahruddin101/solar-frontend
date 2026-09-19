import { Suspense } from 'react';
import Designs from '@/components/dashboard/Designs';

export default function Page() {
  return (
    <Suspense>
      <Designs />
    </Suspense>
  );
}

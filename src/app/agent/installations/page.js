import { Suspense } from 'react';
import Installations from '@/components/dashboard/Installations';

export default function Page() {
  return (
    <Suspense>
      <Installations basePath="/agent/installations" />
    </Suspense>
  );
}

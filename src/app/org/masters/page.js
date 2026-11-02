'use client';

import { Suspense } from 'react';
import Masters from '@/components/dashboard/Masters';

export default function OrgMastersPage() {
  return (
    <Suspense>
      <Masters scope="organization" />
    </Suspense>
  );
}

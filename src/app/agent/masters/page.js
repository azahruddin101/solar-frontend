import { Suspense } from 'react';
import Masters from '@/components/dashboard/Masters';

// Staff with the "catalog" permission manage catalog categories here. Every other master (agent roles,
// installation steps and charges, product units, pricing defaults) is owner-only and isn't exposed on
// this trimmed-down staff view.
export default function Page() {
  return (
    <Suspense>
      <Masters tabIds={['catalog-categories']} pageProps={{ catalogPath: '/agent/catalog' }} />
    </Suspense>
  );
}

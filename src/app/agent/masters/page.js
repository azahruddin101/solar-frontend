import { Suspense } from 'react';
import Masters from '@/components/dashboard/Masters';

// Staff with the "catalog" permission manage the catalog's own setup lists (categories, product units)
// here — the other Masters tabs (agent roles, installation steps/charges) belong to different permissions
// and aren't exposed on this trimmed-down staff view.
export default function Page() {
  return (
    <Suspense>
      <Masters tabIds={['catalog-categories', 'product-units']} pageProps={{ catalogPath: '/agent/catalog' }} />
    </Suspense>
  );
}

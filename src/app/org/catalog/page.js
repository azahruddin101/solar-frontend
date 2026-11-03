'use client';

import { Suspense } from 'react';
import Catalog from '@/components/dashboard/Catalog';

export default function OrgCatalogPage() {
  return (
    <Suspense>
      <Catalog
        catalogOnly
        mastersPath="/org/masters?tab=catalog-categories"
        catalogPath="/org/catalog"
      />
    </Suspense>
  );
}

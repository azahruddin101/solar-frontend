import { Suspense } from 'react';
import AdminCompanies from '@/components/admin/AdminCompanies';

export default function Page() {
  return (
    <Suspense>
      <AdminCompanies />
    </Suspense>
  );
}

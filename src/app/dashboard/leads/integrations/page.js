import { Suspense } from 'react';
import AdminLeadIntegrations from '@/components/admin/leads/AdminLeadIntegrations';
import { PageHeader } from '@/components/kit';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Lead integrations"
        description="Get leads from your Facebook, Instagram and Google ads straight into the CRM. A few clicks, no technical setup."
      />
      <Suspense fallback={null}>
        <AdminLeadIntegrations />
      </Suspense>
    </>
  );
}

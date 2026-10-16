import AdminGoogleLeads from '@/components/admin/leads/AdminGoogleLeads';
import { PageHeader } from '@/components/kit';

// Staff: the leads they may see (their own, or all with "Leads › View all"); actions follow their permissions.
export default function Page() {
  return (
    <>
      <PageHeader title="Google Ads leads" description="Leads from Google Ads lead form extensions." />
      <AdminGoogleLeads />
    </>
  );
}

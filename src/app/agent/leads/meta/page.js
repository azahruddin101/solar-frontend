import AdminMetaLeads from '@/components/admin/leads/AdminMetaLeads';
import { PageHeader } from '@/components/kit';

// Staff: the leads they may see (their own, or all with "Leads › View all"); actions follow their permissions.
export default function Page() {
  return (
    <>
      <PageHeader title="Meta leads" description="Leads from Facebook and Instagram Lead Ads." />
      <AdminMetaLeads />
    </>
  );
}

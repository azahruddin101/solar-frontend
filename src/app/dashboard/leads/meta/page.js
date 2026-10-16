import AdminMetaLeads from '@/components/admin/leads/AdminMetaLeads';
import { PageHeader } from '@/components/kit';

export default function Page() {
  return (
    <>
      <PageHeader
        title="Meta leads"
        description="Leads from Facebook and Instagram Lead Ads for your company."
      />
      <AdminMetaLeads />
    </>
  );
}

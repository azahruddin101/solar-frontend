import AdminGoogleLeads from '@/components/admin/leads/AdminGoogleLeads';

// Staff: the leads they may see (their own, or all with "Leads › View all"); actions follow their permissions.
// The page carries its own heading, so there is no PageHeader here.
export default function Page() {
  return <AdminGoogleLeads />;
}

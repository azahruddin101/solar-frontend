import BillingDetail from '@/components/dashboard/BillingDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <BillingDetail clientId={id} basePath="/agent/billing" />;
}

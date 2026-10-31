import BillingDetail from '@/components/dashboard/BillingDetail';

// A client's sale chain with no proposal: e-way bills, bills and invoices made on the client alone.
export default async function Page({ params }) {
  const { id } = await params;
  return <BillingDetail clientId={id} />;
}

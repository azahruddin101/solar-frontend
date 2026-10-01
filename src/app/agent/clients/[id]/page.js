import ClientDetail from '@/components/dashboard/ClientDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <ClientDetail id={id} basePath="/agent/clients" billingBasePath="/agent/billing" />;
}

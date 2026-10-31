import SubsidyDetail from '@/components/subsidies/SubsidyDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <SubsidyDetail id={id} basePath="/agent/subsidies" clientsPath="/agent/clients" designsPath="/agent/designs" />;
}

import StaffDetail from '@/components/dashboard/StaffDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <StaffDetail agentId={id} />;
}

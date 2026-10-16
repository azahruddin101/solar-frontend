import StaffEditor from '@/components/dashboard/StaffEditor';

export default async function Page({ params }) {
  const { id } = await params;
  return <StaffEditor agentId={id} />;
}

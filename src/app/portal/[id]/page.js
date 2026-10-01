import PortalProposal from '@/components/portal/PortalProposal';

export default async function Page({ params }) {
  const { id } = await params;
  return <PortalProposal id={id} />;
}

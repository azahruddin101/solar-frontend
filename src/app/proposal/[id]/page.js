import QuickProposal from '@/components/dashboard/QuickProposal';

export const metadata = { title: 'Proposal · Innovbit' };

export default async function Page({ params }) {
  const { id } = await params;
  return <QuickProposal designId={id} />;
}

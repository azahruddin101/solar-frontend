import PublicProposal from '@/components/public/PublicProposal';

// opened from a QR code or a shared link: keep it out of search results
export const metadata = { title: 'Solar proposal', robots: { index: false, follow: false } };

export default async function Page({ params }) {
  const { token } = await params;
  return <PublicProposal token={token} />;
}

import PublicDesignView from '@/components/public/PublicDesignView';

export const metadata = { title: '3D view', robots: { index: false, follow: false } };

export default async function Page({ params }) {
  const { token } = await params;
  return <PublicDesignView token={token} />;
}

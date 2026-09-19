import ClientApp from '@/components/ClientApp';

export const metadata = { title: 'Designer · Innovbit' };

export default async function Page({ params }) {
  const { id, step } = await params;
  return <ClientApp designId={id} slug={step} />;
}

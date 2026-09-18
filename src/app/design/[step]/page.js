import ClientApp from '@/components/ClientApp';

export default async function Page({ params }) {
  const { step } = await params;
  return <ClientApp slug={step} />;
}

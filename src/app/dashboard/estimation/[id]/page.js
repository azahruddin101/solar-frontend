import Estimation from '@/components/estimation/Estimation';

export default async function Page({ params }) {
  const { id } = await params;
  return <Estimation id={id} />;
}

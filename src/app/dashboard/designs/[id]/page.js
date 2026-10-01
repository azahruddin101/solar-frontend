import DesignDetail from '@/components/dashboard/DesignDetail';

export default async function Page({ params }) {
  const { id } = await params;
  return <DesignDetail designId={id} />;
}

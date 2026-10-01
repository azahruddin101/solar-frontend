import PortalDesignView from '@/components/portal/PortalDesignView';

export const metadata = { title: '3D view · Innovbit' };

export default async function Page({ params }) {
  const { id } = await params;
  return <PortalDesignView id={id} />;
}

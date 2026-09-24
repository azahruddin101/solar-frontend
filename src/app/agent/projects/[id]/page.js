import ProjectView from '@/components/installations/ProjectView';

export default async function Page({ params }) {
  const { id } = await params;
  return <ProjectView id={id} mode="agent" />;
}

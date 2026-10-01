import { redirect } from 'next/navigation';

// this list now lives on the Manage Masters page; old links keep working
export default function Page() {
  redirect('/dashboard/masters?tab=agent-roles');
}

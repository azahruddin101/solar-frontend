'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Masters from '@/components/dashboard/Masters';
import { useSession } from '@/lib/session';
import { isOrgAdmin } from '@/lib/tenant';
import { FullPageLoader } from '@/components/kit';

function MastersRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const user = useSession((s) => s.user);
  const status = useSession((s) => s.status);

  useEffect(() => {
    if (status !== 'ready' || !isOrgAdmin(user)) return;
    const q = params.toString();
    router.replace(q ? `/org/masters?${q}` : '/org/masters');
  }, [status, user, params, router]);

  if (status !== 'ready') return <FullPageLoader />;
  if (isOrgAdmin(user)) return <FullPageLoader />;

  return <Masters scope="branch" />;
}

export default function Page() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <MastersRedirect />
    </Suspense>
  );
}

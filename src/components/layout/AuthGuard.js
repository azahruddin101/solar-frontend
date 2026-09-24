'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useSession } from '@/lib/session';
import { applyTheme, clearTheme } from '@/lib/theme';
import { FullPageLoader } from '../kit';

/** Renders children only for a signed-in user with `role`; everyone else is redirected. */
export default function AuthGuard({ role, children }) {
  const router = useRouter();
  const { status, user, company, init } = useSession();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
    else if (status === 'ready' && user.role !== role) router.replace(homeFor(user.role));
  }, [status, user, role, router]);

  // company and agent workspaces wear the company's colours
  const primary = company?.theme?.primary;
  const accent = company?.theme?.accent;
  useEffect(() => {
    if (role === 'superadmin' || !primary) return undefined;
    applyTheme({ primary, accent });
    return clearTheme;
  }, [role, primary, accent]);

  if (status !== 'ready' || user.role !== role) return <FullPageLoader />;
  return children;
}

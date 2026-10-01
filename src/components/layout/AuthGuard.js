'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useSession } from '@/lib/session';
import { applyTheme, clearTheme } from '@/lib/theme';
import { FullPageLoader } from '../kit';

/**
 * Renders children only for a signed-in user whose role is `role` (a string, or an array to allow
 * more than one — e.g. a page both the company owner and its staff can open). When `permission` is
 * given, a non-company role must also hold that staff permission; the company owner is never checked
 * against it (they always have full access). Everyone else is redirected to their own home.
 */
export default function AuthGuard({ role, permission, children }) {
  const router = useRouter();
  const { status, user, company, init } = useSession();
  const roles = Array.isArray(role) ? role : [role];
  const roleOk = status === 'ready' && roles.includes(user.role);
  const denied = roleOk && permission && user.role !== 'company' && !user.permissions?.includes(permission);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
    else if (status === 'ready' && !roleOk) router.replace(homeFor(user.role));
    else if (denied) router.replace(homeFor(user.role));
  }, [status, user, roleOk, denied, router]);

  // company and agent workspaces wear the company's colours
  const primary = company?.theme?.primary;
  const accent = company?.theme?.accent;
  useEffect(() => {
    if (roles.includes('superadmin') || !primary) return undefined;
    applyTheme({ primary, accent });
    return clearTheme;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, primary, accent]);

  if (status !== 'ready' || !roleOk || denied) return <FullPageLoader />;
  return children;
}

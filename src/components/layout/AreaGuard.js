'use client';

// Wraps a staff workspace area (see app/agent/*/layout.js): the page renders only for someone who may view the area;
// everyone else gets the No access panel inside the app shell, with what's missing — not a silent redirect.
import { canView } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import NoAccess from './NoAccess';

export default function AreaGuard({ area, children }) {
  const user = useSession((s) => s.user);
  if (!user) return null; // the workspace's AuthGuard is still loading the session
  return canView(user, area) ? children : <NoAccess area={area} />;
}

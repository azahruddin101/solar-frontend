'use client';

// Unassigned lead the signed-in user held before — still visible in their scoped list.
import { leadHeldByUserBefore } from '@/lib/leadAssignment';
import { useSession } from '@/lib/session';
import { Badge } from '../kit';

export default function PreviouslyYoursBadge({ lead, className }) {
  const userId = useSession((s) => s.user?.id);
  if (!leadHeldByUserBefore(lead, userId)) return null;
  return (
    <Badge tone="blue" className={className} title="You held this lead before; it is not assigned to anyone now">
      Previously yours
    </Badge>
  );
}

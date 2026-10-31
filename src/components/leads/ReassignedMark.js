'use client';

// "Reassigned ×2" under the person a lead is with, with everyone who held it before on hover.
import { ArrowLeftRight } from 'lucide-react';

export const LOG_TITLE = { lead_assigned: 'Assigned', lead_reassigned: 'Reassigned', lead_unassigned: 'Assignment removed', lead_status: 'Status changed', lead_rescheduled: 'Rescheduled' };

export default function ReassignedMark({ lead }) {
  if (!lead?.isReassigned) return null;
  const before = (lead.assignmentHistory || []).filter((h) => h.endedAt).map((h) => h.name).filter(Boolean).join(', ');
  return (
    <div className="mt-0.5 flex items-center gap-1 text-xs font-medium whitespace-nowrap text-violet-700" title={before ? `Before: ${before}` : undefined}>
      <ArrowLeftRight className="h-3 w-3" />Reassigned{lead.reassignedCount > 1 ? ` ×${lead.reassignedCount}` : ''}
    </div>
  );
}

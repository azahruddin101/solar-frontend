'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { cx } from '../kit';
import AmcBoard from './AmcBoard';

/** Company workspace: every visit; assign and complete follow the signed-in user's permissions. */
export function CompanyAmc() {
  const me = useSession((s) => s.user);
  return (
    <AmcBoard
      canAssign={can(me, 'tasks', 'assign')}
      canComplete={can(me, 'tasks', 'change_status')}
      canInvoiceParts={can(me, 'tasks', 'invoice_parts')}
      settingsPath={me?.role === 'company' ? '/dashboard/masters?tab=amc-schedule' : null}
    />
  );
}

/** Staff workspace: their own visits; staff who may view all installations can switch to every visit. */
export function AgentAmc() {
  const me = useSession((s) => s.user);
  const seesAll = can(me, 'tasks', 'view');
  const params = useSearchParams();
  const [scope, setScope] = useState(() => (params.get('scope') === 'all' ? 'all' : 'mine')); // ?scope=all: from an AMC request notification
  const toggle = seesAll ? (
    <div role="tablist" aria-label="Which visits" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm font-medium">
      {[['mine', 'My visits'], ['all', 'All visits']].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={scope === id} onClick={() => setScope(id)} className={cx('rounded-md px-3 py-1.5', scope === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {label}
        </button>
      ))}
    </div>
  ) : null;

  if (scope === 'all' && seesAll) {
    return (
      <AmcBoard
        key="all"
        headerExtra={toggle}
        installationsPath="/agent/installations"
        canAssign={can(me, 'tasks', 'assign')}
        canComplete={can(me, 'tasks', 'change_status')}
        canInvoiceParts={can(me, 'tasks', 'invoice_parts')}
      />
    );
  }
  return (
    <AmcBoard
      key="mine"
      title="My AMC visits"
      description="Visits assigned to you. Open a visit, tick every checklist item and mark it completed."
      apiPath="/api/my/projects/amc-visits"
      completeBase="/api/my/projects"
      installationsPath="/agent/projects"
      headerExtra={toggle}
      canComplete
      canInvoiceParts={can(me, 'tasks', 'invoice_parts')}
    />
  );
}

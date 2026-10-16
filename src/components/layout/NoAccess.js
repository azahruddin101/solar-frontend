'use client';

// What a staff member sees instead of a page their permissions don't open — said plainly, with who can change it.
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { PERMISSION_CATALOG } from '@/lib/permissions';
import { homeFor, useSession } from '@/lib/session';
import { buttonClass } from '../kit';

export default function NoAccess({ area, action = 'view', title, children }) {
  const role = useSession((s) => s.user?.role);
  const a = area && PERMISSION_CATALOG[area];
  const needs = a ? `${a.label} › ${a.actions[action] || action}` : null;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center" role="alert">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-500"><Lock className="h-6 w-6" /></span>
      <h1 className="text-lg font-semibold text-slate-900">{title || (a ? `You don’t have access to ${a.label}` : 'You don’t have access to this page')}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {children || (needs ? <>This needs the <b className="font-medium text-slate-700">{needs}</b> permission. Ask your company admin to add it to one of your roles.</> : 'Ask your company admin if you need it.')}
      </p>
      <Link href={homeFor(role)} className={buttonClass({ className: 'mt-6' })}>Go to my workspace</Link>
    </div>
  );
}

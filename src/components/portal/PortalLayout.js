'use client';

import { BadgeIndianRupee, CalendarClock, FileText, Landmark, LifeBuoy, UserCog } from 'lucide-react';
import { useResource } from '@/lib/useResource';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const nav = (hasLoan, hasSubsidy) => [
  {
    items: [
      { href: '/portal', label: 'My proposals', icon: FileText, exact: true },
      ...(hasLoan ? [{ href: '/portal/loans', label: 'My loans', icon: Landmark }] : []), // only clients with a proposal bought on a loan
      ...(hasSubsidy ? [{ href: '/portal/subsidies', label: 'My subsidies', icon: BadgeIndianRupee }] : []), // only clients with a proposal that has a subsidy
      { href: '/portal/maintenance', label: 'Maintenance (AMC)', icon: CalendarClock },
      { href: '/portal/support', label: 'Help & support', icon: LifeBuoy },
    ],
  },
  { title: 'Settings', items: [{ href: '/portal/account', label: 'My account', icon: UserCog }] },
];

export default function PortalLayout({ children }) {
  return (
    <AuthGuard role="client">
      <PortalShell>{children}</PortalShell>
    </AuthGuard>
  );
}

// inside the guard, so the loan is only asked for once the client's session is loaded
function PortalShell({ children }) {
  const loans = useResource('/api/portal/loans');
  const subsidies = useResource('/api/portal/subsidies');
  return <AppShell nav={nav(loans.data?.length > 0, subsidies.data?.length > 0)} workspace="Client portal">{children}</AppShell>;
}

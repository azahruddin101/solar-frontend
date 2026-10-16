'use client';

import { Bell, Boxes, ClipboardList, HardHat, Headset, LifeBuoy, Megaphone, PanelsTopLeft, PenTool, Receipt, UserCog, Users } from 'lucide-react';
import { canView } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

// A staff member's own assigned work is always visible. Each area appears once they may view it (every page here
// starts from a list); inside, each page shows only the actions their permissions allow (see lib/permissions.js).
const AREA_NAV = [
  {
    area: 'leads',
    href: '/agent/leads/meta',
    label: 'Leads',
    icon: Megaphone,
    children: [
      { href: '/agent/leads/meta', label: 'Meta leads' },
      { href: '/agent/leads/google', label: 'Google Ads leads' },
      { href: '/agent/leads/manual', label: 'Manual leads' },
    ],
  },
  { area: 'proposals', href: '/agent/designs', label: 'Proposals', icon: PenTool },
  { area: 'clients', href: '/agent/clients', label: 'Clients', icon: Users },
  { area: 'finances', href: '/agent/billing', label: 'Finances', icon: Receipt },
  { area: 'tasks', href: '/agent/installations', label: 'Installations', icon: HardHat },
  { area: 'helpdesk', href: '/agent/client-support', label: 'Client support', icon: Headset },
  { area: 'support', href: '/agent/support', label: 'Platform support', icon: LifeBuoy },
  { area: 'inventory', href: '/agent/packages', label: 'Packages', icon: Boxes },
  { area: 'inventory', href: '/agent/catalog', label: 'Product catalog', icon: PanelsTopLeft },
];

export default function AgentLayout({ children }) {
  const user = useSession((s) => s.user);
  const granted = AREA_NAV.filter((n) => canView(user, n.area));
  const nav = [
    { items: [{ href: '/agent', label: 'My tasks', icon: ClipboardList, exact: true }, ...granted, { href: '/agent/notifications', label: 'Notifications', icon: Bell }] },
    { title: 'Settings', items: [{ href: '/agent/account', label: 'My account', icon: UserCog }] },
  ];
  return (
    <AuthGuard role="agent">
      <AppShell nav={nav} workspace="Staff workspace">{children}</AppShell>
    </AuthGuard>
  );
}

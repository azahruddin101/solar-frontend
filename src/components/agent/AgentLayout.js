'use client';

import { Bell, Boxes, ClipboardList, HardHat, LifeBuoy, PanelsTopLeft, PenTool, Receipt, UserCog, Users } from 'lucide-react';
import { staffHasAreaAccess } from '@/lib/agents';
import { useSession } from '@/lib/session';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

// A staff member's own assigned work is always visible; each of these is shown as soon as the company
// has granted at least one CRUD action (view/create/update/delete) in the matching area — the page
// itself only shows the buttons for the exact actions granted (see e.g. Designs.js reading useSession).
const AREA_NAV = [
  { area: 'designs', href: '/agent/designs', label: 'Proposals', icon: PenTool },
  { area: 'clients', href: '/agent/clients', label: 'Clients', icon: Users },
  { area: 'billing', href: '/agent/billing', label: 'Billing', icon: Receipt },
  { area: 'installations', href: '/agent/installations', label: 'Installations', icon: HardHat },
  { area: 'support', href: '/agent/support', label: 'Support', icon: LifeBuoy },
  { area: 'catalog', href: '/agent/packages', label: 'Packages', icon: Boxes },
  { area: 'catalog', href: '/agent/catalog', label: 'Product catalog', icon: PanelsTopLeft },
];

export default function AgentLayout({ children }) {
  const permissions = useSession((s) => s.user?.permissions) || [];
  const granted = AREA_NAV.filter((n) => staffHasAreaAccess(permissions, n.area));
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

'use client';

import { Bell, Boxes, LifeBuoy, CreditCard, FolderTree, HardHat, LayoutDashboard, ListChecks, PanelsTopLeft, PenTool, Ruler, Settings, Tags, UserCog, Users } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/clients', label: 'Clients', icon: Users },
      { href: '/dashboard/designs', label: 'Designs', icon: PenTool },
      { href: '/dashboard/packages', label: 'Packages', icon: Boxes },
      { href: '/dashboard/installations', label: 'Installations', icon: HardHat },
      { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
      { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/dashboard/team', label: 'Team', icon: UserCog },
      { href: '/dashboard/agent-roles', label: 'Agent roles', icon: Tags },
      { href: '/dashboard/workflow', label: 'Installation steps', icon: ListChecks },
      { href: '/dashboard/catalog', label: 'Product catalog', icon: PanelsTopLeft },
      { href: '/dashboard/categories', label: 'Catalog categories', icon: FolderTree },
      { href: '/dashboard/units', label: 'Product units', icon: Ruler },
      { href: '/dashboard/plan', label: 'Plan & billing', icon: CreditCard },
      { href: '/dashboard/settings', label: 'Settings & branding', icon: Settings },
    ],
  },
];

export default function DashboardLayout({ children }) {
  return (
    <AuthGuard role="company">
      <AppShell nav={NAV} workspace="Company workspace">{children}</AppShell>
    </AuthGuard>
  );
}

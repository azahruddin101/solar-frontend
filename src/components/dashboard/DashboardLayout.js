'use client';

import { Bell, Boxes, SlidersHorizontal, LifeBuoy, CreditCard, FolderTree, HardHat, LayoutDashboard, ListChecks, PanelsTopLeft, PenTool, Receipt, Ruler, Settings, Tags, UserCog, Wrench, Users } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/clients', label: 'Clients', icon: Users },
      { href: '/dashboard/designs', label: 'Proposals', icon: PenTool },
      { href: '/dashboard/billing', label: 'Billing & Invoices', icon: Receipt },
      { href: '/dashboard/packages', label: 'Packages', icon: Boxes },
      { href: '/dashboard/installations', label: 'Task Management', icon: HardHat },
      { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/dashboard/team', label: 'Staff Management', icon: UserCog },
      { href: '/dashboard/catalog', label: 'Inventory', icon: PanelsTopLeft },
      { href: '/dashboard/masters', label: 'Manage Masters', icon: SlidersHorizontal },
      { href: '/dashboard/plan', label: 'Plan & billing', icon: CreditCard },
      { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
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

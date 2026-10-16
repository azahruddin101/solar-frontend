'use client';

import { Bell, Boxes, Headset, SlidersHorizontal, LifeBuoy, CreditCard, HardHat, LayoutDashboard, Megaphone, PanelsTopLeft, PenTool, Plug, Receipt, Settings, UserCog, Users } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      {
        href: '/dashboard/leads/meta',
        label: 'Leads',
        icon: Megaphone,
        countKey: 'leads', // all three sources together
        children: [
          { href: '/dashboard/leads/meta', label: 'Meta leads' },
          { href: '/dashboard/leads/google', label: 'Google Ads leads' },
          { href: '/dashboard/leads/manual', label: 'Manual leads' },
        ],
      },
      { href: '/dashboard/clients', label: 'Clients', icon: Users },
      { href: '/dashboard/designs', label: 'Proposals', icon: PenTool },
      { href: '/dashboard/billing', label: 'Billing & Invoices', icon: Receipt },
      { href: '/dashboard/packages', label: 'Packages', icon: Boxes },
      { href: '/dashboard/installations', label: 'Task Management', icon: HardHat },
      { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
      { href: '/dashboard/client-support', label: 'Client support', icon: Headset },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/dashboard/team', label: 'Staff Management', icon: UserCog },
      { href: '/dashboard/catalog', label: 'Inventory', icon: PanelsTopLeft },
      { href: '/dashboard/masters', label: 'Manage Masters', icon: SlidersHorizontal },
      { href: '/dashboard/plan', label: 'Plan & billing', icon: CreditCard },
      { href: '/dashboard/support', label: 'Platform support', icon: LifeBuoy },
      { href: '/dashboard/leads/integrations', label: 'Lead integrations', icon: Plug },
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

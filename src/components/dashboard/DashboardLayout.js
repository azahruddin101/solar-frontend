'use client';

import { LayoutDashboard, PanelsTopLeft, PenTool, Settings, Users } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/clients', label: 'Clients', icon: Users },
      { href: '/dashboard/designs', label: 'Designs', icon: PenTool },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/dashboard/catalog', label: 'Product catalog', icon: PanelsTopLeft },
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

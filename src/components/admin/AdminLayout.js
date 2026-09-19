'use client';

import { Building2, LayoutDashboard, UserCog } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/companies', label: 'Companies', icon: Building2 },
    ],
  },
  { title: 'Settings', items: [{ href: '/admin/account', label: 'My account', icon: UserCog }] },
];

export default function AdminLayout({ children }) {
  return (
    <AuthGuard role="superadmin">
      <AppShell nav={NAV} workspace="Admin console">{children}</AppShell>
    </AuthGuard>
  );
}

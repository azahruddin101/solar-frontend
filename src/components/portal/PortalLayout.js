'use client';

import { FileText, LifeBuoy, UserCog } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  {
    items: [
      { href: '/portal', label: 'My proposals', icon: FileText, exact: true },
      { href: '/portal/support', label: 'Help & support', icon: LifeBuoy },
    ],
  },
  { title: 'Settings', items: [{ href: '/portal/account', label: 'My account', icon: UserCog }] },
];

export default function PortalLayout({ children }) {
  return (
    <AuthGuard role="client">
      <AppShell nav={NAV} workspace="Client portal">{children}</AppShell>
    </AuthGuard>
  );
}

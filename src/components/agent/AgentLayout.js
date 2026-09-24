'use client';

import { Bell, ClipboardList, UserCog } from 'lucide-react';
import AppShell from '../layout/AppShell';
import AuthGuard from '../layout/AuthGuard';

const NAV = [
  { items: [{ href: '/agent', label: 'My tasks', icon: ClipboardList, exact: true }, { href: '/agent/notifications', label: 'Notifications', icon: Bell }] },
  { title: 'Settings', items: [{ href: '/agent/account', label: 'My account', icon: UserCog }] },
];

export default function AgentLayout({ children }) {
  return (
    <AuthGuard role="agent">
      <AppShell nav={NAV} workspace="Agent workspace">{children}</AppShell>
    </AuthGuard>
  );
}

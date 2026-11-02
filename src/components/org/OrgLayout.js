'use client';

import { GitBranch, LayoutDashboard, SlidersHorizontal } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import AuthGuard from '@/components/layout/AuthGuard';
import BranchSwitcher from '@/components/org/BranchSwitcher';

/** Company admin: dashboard → branches → masters. Branch day-to-day work opens from the dashboard via “Manage branch”. */
const NAV = [
  {
    items: [
      { href: '/org', label: 'Company dashboard', icon: LayoutDashboard, exact: true },
      { href: '/org/branches', label: 'Branches', icon: GitBranch },
      { href: '/org/masters', label: 'Masters', icon: SlidersHorizontal },
    ],
  },
];

export default function OrgLayout({ children }) {
  return (
    <AuthGuard role="company">
      <AppShell nav={NAV} workspace="Company" headerExtra={<BranchSwitcher />}>{children}</AppShell>
    </AuthGuard>
  );
}

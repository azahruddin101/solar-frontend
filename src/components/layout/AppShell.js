'use client';

// Sidebar layout shared by the admin console and the company workspace.
import { ArrowLeftRight, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Avatar, ImageFrame, Toaster, cx } from '../kit';
import { BrandMark, PRODUCT_NAME } from './Brand';

function NavLink({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx('group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-white/12 text-white shadow-[inset_3px_0_0_var(--accent)]' : 'text-white/60 hover:bg-white/5 hover:text-white')}
    >
      <item.icon className={cx('h-[18px] w-[18px] shrink-0', active ? 'text-accent' : 'text-white/45 group-hover:text-white/80')} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && <span className="rounded-full bg-white/10 px-2 py-px text-xs text-white/70">{item.badge}</span>}
    </Link>
  );
}

export default function AppShell({ nav, workspace, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, company, impersonated, logout, stopImpersonating } = useSession();
  const [open, setOpen] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const signOut = () => {
    logout();
    router.replace('/login');
  };
  const backToAdmin = async () => {
    await stopImpersonating();
    router.replace('/admin/companies');
  };

  const sidebar = (
    <div className="relative isolate flex h-full w-64 flex-col bg-brand-950">
      {/* glow of the company colour behind the logo; -z-10 keeps it under the content */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-brand-900 to-transparent" />
      {company?.logo ? (
        <div className="px-4 pt-4 pb-1">
          <ImageFrame src={assetUrl(company.logo)} className="h-14 w-full rounded-xl" />
          <div className="mt-3 px-1">
            <div className="truncate text-sm font-semibold text-white" title={company.name}>{company.name}</div>
            <div className="truncate text-xs text-white/50">{workspace}</div>
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center gap-3 px-5">
          {company ? <Avatar name={company.name} square size={36} /> : <BrandMark size={36} />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white" title={company?.name}>{company?.name || PRODUCT_NAME}</div>
            <div className="truncate text-xs text-white/50">{workspace}</div>
          </div>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {nav.map((group) => (
          <div key={group.title || 'main'}>
            {group.title && <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/35 uppercase">{group.title}</div>}
            <div className="space-y-0.5">
              {group.items.map((item) => <NavLink key={item.href} item={item} active={isActive(item)} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.name || user.email} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-white">{user.name || (user.role === 'superadmin' ? 'Super Admin' : 'Account')}</div>
            <div className="truncate text-xs text-white/50">{user.email}</div>
          </div>
          <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh bg-slate-50 text-slate-900">
      <aside className="hidden shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-slate-950/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative h-full w-64 animate-fade shadow-2xl">{sidebar}</div>
          <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="absolute top-4 left-[17rem] grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"><X className="h-5 w-5" /></button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {impersonated && (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-[13px] font-medium text-slate-950">
            You are signed in as {company?.name} (super admin access).
            <button type="button" onClick={backToAdmin} className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-800">
              <ArrowLeftRight className="h-3.5 w-3.5" /> Back to admin console
            </button>
          </div>
        )}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100"><Menu className="h-5 w-5" /></button>
          <span className="truncate text-sm font-semibold">{company?.name || PRODUCT_NAME}</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:py-10">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}

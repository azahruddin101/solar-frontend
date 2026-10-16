'use client';

// Sidebar layout shared by the admin console and the company workspace.
import { ArrowLeftRight, Bell, ChevronDown, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useCounts } from '@/lib/counts';
import { useUnread } from '@/lib/unread';
import { Avatar, ImageFrame, Toaster, cx } from '../kit';
import { BrandMark, PRODUCT_NAME } from './Brand';
import PushNotifications from './PushNotifications';

/** Which count sits beside which sidebar link (company workspace and admin console). Zero is shown too. */
const COUNT_FOR = {
  '/dashboard/clients': { key: 'clients' },
  '/dashboard/designs': { key: 'designs' },
  '/dashboard/billing': { key: 'billing' },
  '/dashboard/packages': { key: 'packages' },
  '/dashboard/installations': { key: 'installations' },
  '/dashboard/team': { key: 'team' },
  '/dashboard/catalog': { key: 'products' },
  '/dashboard/leads/meta': { key: 'metaLeads' },
  '/dashboard/leads/google': { key: 'googleLeads' },
  '/dashboard/leads/manual': { key: 'manualLeads' },
  // admin console
  '/admin/companies': { key: 'companies' },
  '/admin/plans': { key: 'plans' },
  '/admin/plan-requests': { key: 'planRequests' },
};

function NavLink({ item, active, onNavigate, compact, nested, collapsed }) {
  if (collapsed) {
    // icon only; the name shows on hover (and is read out by screen readers)
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={item.label}
        className={cx('relative mx-auto grid h-10 w-10 place-items-center rounded-lg transition-colors', active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white')}
      >
        {item.icon && <item.icon className="h-[18px] w-[18px]" />}
        {item.badge !== undefined && item.badge !== 0 && <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-white/20 px-1 text-[10px] leading-none font-semibold text-white">{item.badge}</span>}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group flex items-center rounded-lg font-medium transition-colors',
        compact ? 'gap-2.5 px-2 py-1.5 text-[13px]' : 'gap-3 px-3 py-2 text-sm',
        nested && 'py-1.5 pl-9 pr-3 text-[13px]',
        active ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#ffffff]' : 'text-white hover:bg-white/5',
      )}
    >
      {item.icon && <item.icon className={cx('shrink-0 text-white', compact || nested ? 'h-4 w-4' : 'h-[18px] w-[18px]')} />}
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && <span className="rounded-full bg-white/10 px-2 py-px text-xs text-white/70">{item.badge}</span>}
    </Link>
  );
}

function NavItem({ item, active, onNavigate, pathname, withBadge, collapsed }) {
  const childActive = item.children?.some((c) => (c.exact ? pathname === c.href : pathname === c.href || pathname.startsWith(`${c.href}/`)));
  const [open, setOpen] = useState(Boolean(childActive));
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (!item.children?.length) {
    return <NavLink item={withBadge(item)} active={active} onNavigate={onNavigate} collapsed={collapsed} />;
  }
  // collapsed sidebar: a group is one icon that opens its first page
  const groupBadge = withBadge(item).badge;
  if (collapsed) return <NavLink item={{ ...item, href: item.children[0].href, badge: groupBadge }} active={childActive} onNavigate={onNavigate} collapsed />;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          childActive ? 'bg-white/5 text-white' : 'text-white hover:bg-white/5',
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0 text-white" />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {groupBadge !== undefined && <span className="rounded-full bg-white/10 px-2 py-px text-xs text-white/70">{groupBadge}</span>}
        <ChevronDown className={cx('h-4 w-4 shrink-0 text-white/70 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavLink
              key={child.href}
              item={withBadge(child)}
              nested
              active={child.exact ? pathname === child.href : pathname === child.href || pathname.startsWith(`${child.href}/`)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The desktop sidebar can be collapsed to an icon rail; the choice is remembered in this browser.
const COLLAPSED_KEY = 'sp.sidebarCollapsed';

export default function AppShell({ nav, workspace, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, company, impersonated, logout, stopImpersonating } = useSession();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(COLLAPSED_KEY) === '1') setCollapsed(true);
    } catch { /* storage unavailable: start expanded */ }
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
    } catch { /* not remembered, still works */ }
    return !c;
  });
  const unread = useUnread((s) => s.count);
  const ticketsUnread = useUnread((s) => s.tickets);
  const clientTicketsUnread = useUnread((s) => s.clientTickets);
  const refreshUnread = useUnread((s) => s.refresh);
  const inboxUser = user?.role === 'company' || user?.role === 'agent';
  const inboxLink = inboxUser ? nav.flatMap((g) => g.items).find((i) => i.href.endsWith('/notifications')) : null;

  // Badges on Notifications and the support links; refreshed on navigation and every minute.
  useEffect(() => {
    if (!user) return undefined;
    const tick = () => refreshUnread(user);
    tick();
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, [user, refreshUnread, pathname]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname]);

  // the company workspace also shows how many clients, designs, products… there are
  const counts = useCounts((s) => s.counts);
  const refreshCounts = useCounts((s) => s.refresh);
  const refreshCountsSoon = useCounts((s) => s.refreshSoon);
  const countsPath = user?.role === 'company' ? '/api/dashboard/counts' : user?.role === 'superadmin' ? '/api/admin/counts' : '';
  const showCounts = Boolean(countsPath);
  useEffect(() => {
    if (!showCounts) return undefined;
    const load = () => refreshCounts(countsPath);
    const soon = () => refreshCountsSoon(countsPath);
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('sp:changed', soon);
    window.addEventListener('focus', soon);
    return () => {
      clearInterval(t);
      window.removeEventListener('sp:changed', soon);
      window.removeEventListener('focus', soon);
    };
  }, [showCounts, countsPath, refreshCounts, refreshCountsSoon, pathname]);

  const withBadge = (item) => {
    if (item.href.endsWith('/notifications') || item.href.endsWith('/support') || item.href.endsWith('/client-support')) {
      const n = item.href.endsWith('/notifications') ? unread : item.href.endsWith('/client-support') ? clientTicketsUnread : ticketsUnread;
      return n ? { ...item, badge: n > 99 ? '99+' : n } : item;
    }
    // a menu group names its own count (e.g. all leads), its pages use theirs
    const spec = !showCounts ? null : item.children ? (item.countKey ? { key: item.countKey } : null) : COUNT_FOR[item.href];
    const n = spec && counts ? counts[spec.key] : undefined;
    if (n === undefined) return item;
    return { ...item, badge: n > 999 ? '999+' : n };
  };
  const isActive = (item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const signOut = () => {
    logout();
    router.replace('/login');
  };
  const backToAdmin = async () => {
    await stopImpersonating();
    router.replace('/admin/companies');
  };

  // `rail`: the collapsed desktop sidebar (icons only). The mobile drawer is always the full sidebar.
  const renderSidebar = (rail) => (
    <div className={cx('relative isolate flex h-full flex-col border-r border-white/5 bg-slate-900 transition-[width] duration-200', rail ? 'w-[4.5rem]' : 'w-64')}>
      {rail ? (
        <div className="flex flex-col items-center gap-2 pt-4 pb-2">
          {company?.logo ? <ImageFrame src={assetUrl(company.logo)} className="h-10 w-10 rounded-lg" /> : company ? <Avatar name={company.name} square size={36} /> : <BrandMark size={36} />}
        </div>
      ) : company?.logo ? (
        <div className="px-4 pt-4 pb-1">
          <ImageFrame src={assetUrl(company.logo)} className="h-14 w-full rounded-xl" />
          <div className="mt-3 px-1">
            <div className="truncate text-sm font-semibold text-white" title={company.name}>{company.name}</div>
            <div className="truncate text-xs text-slate-400">{workspace}</div>
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center gap-3 px-5">
          {company ? <Avatar name={company.name} square size={36} /> : <BrandMark size={36} />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white" title={company?.name}>{company?.name || PRODUCT_NAME}</div>
            <div className="truncate text-xs text-slate-400">{workspace}</div>
          </div>
        </div>
      )}
      <nav aria-label="Main" className={cx('flex-1 overflow-y-auto py-4', rail ? 'space-y-3 px-2' : 'space-y-6 px-3')}>
        {nav.map((group, gi) => (
          <div key={group.title || 'main'}>
            {group.title && (rail ? gi > 0 && <div className="mx-auto mb-3 h-px w-8 bg-white/10" /> : <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{group.title}</div>)}
            <div className={rail ? 'space-y-1' : 'space-y-0.5'}>
              {group.items.map((item) => (
                <NavItem key={item.href || item.label} item={item} withBadge={withBadge} active={isActive(item)} onNavigate={() => setOpen(false)} pathname={pathname} collapsed={rail} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        {rail ? (
          <div className="flex flex-col items-center gap-2">
            <span title={`${user.name || user.email} · ${user.email}`}><Avatar name={user.name || user.email} size={34} /></span>
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar name={user.name || user.email} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-white">{user.name || (user.role === 'superadmin' ? 'Super Admin' : 'Account')}</div>
              <div className="truncate text-xs text-slate-400">{user.email}</div>
            </div>
            <PushNotifications />
            <button type="button" onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh bg-slate-50 text-slate-900">
      <aside className="relative hidden shrink-0 lg:block">
        {renderSidebar(collapsed)}
        {/* expand / collapse, on the sidebar's edge */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-5 -right-3.5 z-10 grid h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-slate-950/60" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative h-full w-64 animate-fade shadow-2xl">{renderSidebar(false)}</div>
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
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{company?.name || PRODUCT_NAME}</span>
          {inboxLink && (
            <Link href={inboxLink.href} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
            </Link>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          {/* every page uses the full width next to the sidebar */}
          <div className="w-full px-5 py-8 sm:px-8 lg:py-10">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}

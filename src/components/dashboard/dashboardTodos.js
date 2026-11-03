import {
  BadgeIndianRupee,
  CalendarClock,
  Clock,
  FileText,
  HandCoins,
  HardHat,
  Headset,
  Hourglass,
  Landmark,
  MessageSquare,
  Package,
  PackageX,
  ReceiptText,
  UserPlus,
} from 'lucide-react';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Actionable counts from GET /api/dashboard/today. */
export function todoItems(t) {
  const items = [
    { key: 'amc-overdue', n: t.amc.overdue, urgent: true, icon: CalendarClock, text: (n) => `${plural(n, 'service visit')} ${n === 1 ? 'is' : 'are'} late`, href: '/dashboard/amc?view=overdue' },
    { key: 'amc-today', n: t.amc.dueToday, icon: CalendarClock, text: (n) => `${plural(n, 'service visit')} due today`, href: '/dashboard/amc?view=today' },
    { key: 'changes', n: t.proposals.changes, urgent: true, icon: MessageSquare, text: (n) => `${plural(n, 'client')} asked for changes to the quote`, href: '/dashboard/designs?show=changes' },
    { key: 'stuck', n: t.installations.stuckCount, urgent: true, icon: Clock, text: (n) => `${plural(n, 'installation task')} stuck for over a week`, href: '/dashboard/installations?show=stuck' },
    { key: 'support', n: t.support.unread, urgent: true, icon: Headset, text: (n) => `${plural(n, 'client message')} waiting for your reply`, href: '/dashboard/client-support?show=unread' },
    { key: 'leads', n: t.leads.unassigned, icon: UserPlus, text: (n) => `${plural(n, 'new lead')} not given to anyone`, href: '/dashboard/leads?assignedTo=unassigned' },
    { key: 'expiring', n: t.expiring.count, icon: Hourglass, text: (n) => `${plural(n, 'quote')} will expire this week`, href: '/dashboard/designs?show=expiring' },
    { key: 'no-reply', n: t.proposals.noReply, icon: FileText, text: (n) => `${plural(n, 'quote')} with no reply for a week`, href: '/dashboard/designs?show=no_reply' },
    { key: 'not-started', n: t.installations.notStarted, icon: HardHat, text: (n) => `${plural(n, 'booked job')} not started yet`, href: '/dashboard/designs?show=not_started' },
    { key: 'unassigned-steps', n: t.installations.unassignedSteps, icon: HardHat, text: (n) => `${plural(n, 'installation task')} with nobody assigned`, href: '/dashboard/installations?show=unassigned' },
    { key: 'no-invoice', n: t.proposals.noInvoice, icon: ReceiptText, text: (n) => `${plural(n, 'booked job')} without an invoice`, href: '/dashboard/billing?show=no_invoice' },
    { key: 'subsidy', n: t.subsidies.missing, icon: BadgeIndianRupee, text: (n) => `${plural(n, 'booked job')} with a subsidy that is not started`, href: '/dashboard/designs?show=subsidy_missing' },
    { key: 'loan', n: t.loans.missing, icon: Landmark, text: (n) => `${plural(n, 'client')} need${n === 1 ? 's' : ''} a loan that is not started`, href: '/dashboard/designs?show=loan_missing' },
    { key: 'out-stock', n: t.stock.outOfStock, icon: PackageX, text: (n) => `${plural(n, 'product')} out of stock`, href: '/dashboard/catalog?show=out' },
    { key: 'low-stock', n: t.stock.low, icon: Package, text: (n) => `${plural(n, 'product')} running low on stock`, href: '/dashboard/catalog?show=low' },
  ];
  return items.filter((i) => i.n > 0).sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
}

/** Map today’s todos into needs-attention menu rows (branch dashboard). */
export function branchAttentionItems(t, navigate) {
  return todoItems(t).map((item) => ({
    key: item.key,
    icon: item.icon,
    urgent: item.urgent,
    label: item.text(item.n),
    detail: 'Open the page to act on this',
    onClick: () => navigate(item.href),
  }));
}

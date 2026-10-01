import { Badge } from '../kit';

export const StatusBadge = ({ status }) => <Badge dot tone={status === 'active' ? 'green' : 'red'}>{status === 'active' ? 'Active' : 'Suspended'}</Badge>;

/** `max`: longer plan names are cut to that many letters and end in "…" (the full name shows on hover). */
export const PlanBadge = ({ plan, planDetail, max = 0 }) => {
  const full = String(planDetail?.name || plan || '');
  const cut = max > 0 && full.length > max;
  const name = cut ? `${full.slice(0, max).trimEnd()}…` : full;
  const kind = planDetail?.kind;
  const tone = kind === 'custom' ? 'violet' : plan === 'pro' || planDetail?.code === 'pro' ? 'blue' : plan === 'enterprise' ? 'violet' : 'slate';
  return <span title={cut ? full : undefined}><Badge tone={tone}>{name || '—'}</Badge></span>;
};

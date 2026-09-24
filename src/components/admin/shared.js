import { Badge } from '../kit';

export const StatusBadge = ({ status }) => <Badge dot tone={status === 'active' ? 'green' : 'red'}>{status === 'active' ? 'Active' : 'Suspended'}</Badge>;

export const PlanBadge = ({ plan, planDetail }) => {
  const name = planDetail?.name || plan;
  const kind = planDetail?.kind;
  const tone = kind === 'custom' ? 'violet' : plan === 'pro' || planDetail?.code === 'pro' ? 'blue' : plan === 'enterprise' ? 'violet' : 'slate';
  return <Badge tone={tone}>{name || '—'}</Badge>;
};

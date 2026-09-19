import { Badge } from '../kit';

export const PLANS = [
  { id: 'starter', label: 'Starter' },
  { id: 'growth', label: 'Growth' },
  { id: 'enterprise', label: 'Enterprise' },
];

export const StatusBadge = ({ status }) => <Badge dot tone={status === 'active' ? 'green' : 'red'}>{status === 'active' ? 'Active' : 'Suspended'}</Badge>;
export const PlanBadge = ({ plan }) => <Badge tone={plan === 'enterprise' ? 'violet' : plan === 'growth' ? 'blue' : 'slate'}>{PLANS.find((p) => p.id === plan)?.label || plan}</Badge>;

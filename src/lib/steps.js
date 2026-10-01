// Installation steps: the four priorities and the fixed colour of each. The company picks a priority per
// step — in its step template and on each installation; the colour follows from it.

export const STEP_PRIORITIES = [
  { id: 'low', label: 'Low', tone: 'green', color: '#059669' },
  { id: 'medium', label: 'Medium', tone: 'blue', color: '#0284c7' },
  { id: 'high', label: 'High', tone: 'amber', color: '#d97706' },
  { id: 'urgent', label: 'Urgent', tone: 'red', color: '#dc2626' },
];
export const DEFAULT_STEP_PRIORITY = 'medium';
export const stepPriority = (step) => STEP_PRIORITIES.find((p) => p.id === step?.priority) || STEP_PRIORITIES.find((p) => p.id === DEFAULT_STEP_PRIORITY);
export const stepColor = (step) => stepPriority(step).color;

'use client';

// Bits shared by the company's installation screens and the agent workspace.
import { Badge, cx } from '../kit';

export const STEP_STATUSES = [
  { id: 'pending', label: 'Pending', tone: 'slate' },
  { id: 'in_progress', label: 'In progress', tone: 'amber' },
  { id: 'done', label: 'Done', tone: 'green' },
];

export function StepStatusBadge({ status }) {
  const s = STEP_STATUSES.find((x) => x.id === status) || STEP_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

export function ProjectStatusBadge({ status }) {
  return status === 'completed' ? <Badge dot tone="green">Completed</Badge> : <Badge dot tone="blue">In progress</Badge>;
}

export const doneCount = (project) => project.steps.filter((s) => s.status === 'done').length;
/** The step being worked on: the first one that isn't done. */
export const currentStep = (project) => project.steps.find((s) => s.status !== 'done') || null;

export function Progress({ project, className }) {
  const done = doneCount(project);
  const total = project.steps.length || 1;
  return (
    // spans, so it can sit inside a paragraph (card header descriptions)
    <span className={cx('flex items-center gap-2.5', className)}>
      <span className="block h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span className={cx('block h-full rounded-full transition-[width]', done === total ? 'bg-emerald-500' : 'bg-brand')} style={{ width: `${(done / total) * 100}%` }} />
      </span>
      <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">{done}/{project.steps.length}</span>
    </span>
  );
}

/** What each log entry says after the person's name. `message` carries the detail (agent name, note…). */
const ACTIONS = {
  started: () => 'started the installation',
  completed: () => 'All steps done — installation completed',
  reopened: () => 'Installation reopened',
  step_assigned: (l) => `assigned “${l.stepName}” to ${l.message || 'an agent'}`,
  step_unassigned: (l) => `unassigned “${l.stepName}”`,
  step_started: (l) => `started “${l.stepName}”`,
  step_completed: (l) => `completed “${l.stepName}”`,
  step_reopened: (l) => `reopened “${l.stepName}”`,
  step_added: (l) => `added the step “${l.stepName}”`,
  step_removed: (l) => `removed the step “${l.stepName}”`,
  step_renamed: (l) => `renamed a step to “${l.stepName}”`,
  note: (l) => (l.stepName ? `left a note on “${l.stepName}”` : 'left a note'),
};
const SYSTEM = ['completed', 'reopened'];
// actions whose `message` is a free-text note rather than part of the sentence
const WITH_NOTE = ['note', 'step_started', 'step_completed', 'step_reopened', 'step_renamed'];

export const describeLog = (l) => ({
  who: SYSTEM.includes(l.action) ? '' : l.byName || 'Someone',
  text: (ACTIONS[l.action] || (() => l.action))(l),
  note: WITH_NOTE.includes(l.action) ? l.message : '',
  lat: l.lat,
  lng: l.lng,
  imageUrl: l.imageUrl,
});

export const formatDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

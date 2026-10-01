/** Human-readable lines for the merged design + installation audit trail. */

const STATUS_LABELS = { draft: 'Draft', proposed: 'Proposed', won: 'Booked', lost: 'Lost' };

function statusLine(msg) {
  const m = String(msg || '').match(/^(\w+)\s*→\s*(\w+)$/);
  if (!m) return msg;
  return `${STATUS_LABELS[m[1]] || m[1]} → ${STATUS_LABELS[m[2]] || m[2]}`;
}

const CLIENT_ACTIONS = {
  client_created: (e) => ({ text: 'Client added', detail: e.message }),
  client_updated: () => ({ text: 'Client details updated' }),
};

const DESIGN_ACTIONS = {
  design_created: (e) => ({ text: 'Design started', detail: e.message }),
  design_updated: () => ({ text: 'Design workspace updated' }),
  design_status_changed: (e) => ({ text: 'Design status changed', detail: statusLine(e.message) }),
  design_renamed: (e) => ({ text: 'Design renamed', detail: e.message }),
  design_client_changed: () => ({ text: 'Client on design updated' }),
  design_duplicated: (e) => ({ text: 'Design created as copy', detail: e.message }),
  client_proposal_accepted: (e) => ({ text: 'Client accepted the proposal', detail: e.message }),
  client_proposal_rejected: (e) => ({ text: 'Client declined the proposal', detail: e.message }),
  client_proposal_changes_requested: (e) => ({ text: 'Client requested changes', detail: e.message }),
  design_sent_for_client_review: (e) => ({ text: 'Sent to client for review', detail: e.message }),
  installation_started: (e) => ({ text: 'Installation process started', detail: e.message }),
  installation_completed: () => ({ text: 'Installation completed' }),
};

const INSTALL_ACTIONS = {
  started: () => ({ text: 'Installation opened on site' }),
  completed: () => ({ text: 'All installation steps completed' }),
  reopened: () => ({ text: 'Installation reopened' }),
  step_assigned: (e) => ({ text: `Step assigned: ${e.stepName}`, detail: e.message }),
  step_unassigned: (e) => ({ text: `Step unassigned: ${e.stepName}` }),
  step_started: (e) => ({ text: `Step started: ${e.stepName}`, detail: e.message }),
  step_completed: (e) => ({ text: `Step completed: ${e.stepName}`, detail: e.message }),
  step_reopened: (e) => ({ text: `Step reopened: ${e.stepName}`, detail: e.message }),
  step_added: (e) => ({ text: `Step added: ${e.stepName}` }),
  step_removed: (e) => ({ text: `Step removed: ${e.stepName}` }),
  step_renamed: (e) => ({ text: `Step renamed: ${e.stepName}`, detail: e.message }),
  note: (e) => ({ text: e.stepName ? `Note on ${e.stepName}` : 'Note on installation', detail: e.message }),
};

const PHASE_LABEL = { client: 'Client', design: 'Design', installation: 'Installation' };

export function describeLifecycleEvent(e) {
  const fn = e.phase === 'client' ? CLIENT_ACTIONS[e.action] : e.phase === 'design' ? DESIGN_ACTIONS[e.action] : INSTALL_ACTIONS[e.action];
  const base = fn ? fn(e) : { text: e.action.replace(/_/g, ' '), detail: e.message };
  return {
    phase: PHASE_LABEL[e.phase] || e.phase,
    who: e.byName || '',
    text: base.text,
    detail: base.detail || (e.message && !base.detail ? e.message : ''),
    note: e.message && INSTALL_ACTIONS[e.action] ? e.message : '',
    lat: e.lat,
    lng: e.lng,
    imageUrl: e.imageUrl,
  };
}

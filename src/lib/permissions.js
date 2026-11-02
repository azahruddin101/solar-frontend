// Staff permissions (`<area>:<action>`). Mirrors backend/src/constants/permissions.js — the backend test
// tests/permissions.test.js fails if the two catalogs differ. The owner can do everything; staff can do what their
// roles plus their own extra grants allow (the session's `user.permissions` already holds that union).

export const PERMISSION_CATALOG = {
  leads: {
    label: 'Leads',
    description: 'Meta, Google Ads and manually added leads — staff see the leads assigned to them unless they may view all',
    actions: {
      view: 'Assigned to them',
      view_team: 'Their team',
      view_all: 'View all',
      create: 'Add & import',
      change_status: 'Change status',
      update: 'Edit & set priority',
      assign: 'Assign',
      export: 'Export',
    },
  },
  proposals: {
    label: 'Proposals',
    description: 'Rooftop designs and proposals for clients',
    actions: {
      view: 'View',
      create: 'Create',
      update: 'Edit',
      change_status: 'Change status',
      change_client: 'Change client',
      share: 'Share link',
      delete: 'Delete',
    },
  },
  clients: {
    label: 'Clients',
    description: 'Client records',
    actions: {
      view: 'View',
      view_team: 'Their team’s clients',
      create: 'Create',
      update: 'Edit',
      manage_login: 'Portal login',
      delete: 'Delete',
    },
  },
  finances: {
    label: 'Finances',
    description: 'E-way bills, bills (payments) and invoices',
    actions: {
      view: 'View',
      create_eway_bill: 'Create e-way bill',
      create_bill: 'Create bill',
      create_invoice: 'Create invoice',
    },
  },
  inventory: {
    label: 'Inventory',
    description: 'Products, catalog categories, packages, installation charges, stock and suppliers',
    actions: {
      view: 'View',
      create: 'Create',
      update: 'Edit',
      delete: 'Delete',
    },
  },
  tasks: {
    label: 'Installations',
    description: 'Every installation, its steps and AMC visits — staff always see the steps and visits assigned to them',
    actions: {
      view: 'View all',
      view_team: 'Their team’s installations',
      create: 'Start',
      update: 'Edit steps',
      assign: 'Assign steps',
      change_status: 'Update step status',
      invoice_parts: 'Invoice parts used on AMC visits',
      delete: 'Delete',
    },
  },
  support: {
    label: 'Platform support',
    description: 'The company’s own tickets with the platform team',
    actions: {
      view: 'View',
      create: 'Create',
      update: 'Reply & close',
    },
  },
  helpdesk: {
    label: 'Client support',
    description: 'Help requests your clients send from the client portal',
    actions: {
      view: 'View',
      update: 'Reply & change status',
    },
  },
  expenses: {
    label: 'Expenses',
    description: 'What was spent on each proposal’s project, with the reason',
    actions: {
      view: 'View',
      create: 'Add expenses',
      update: 'Edit expenses',
      delete: 'Delete expenses',
    },
  },
  loans: {
    label: 'Loans',
    description: 'Clients who are buying with a loan, and their progress through the loan steps',
    actions: {
      view: 'View',
      update: 'Update loan & steps',
    },
  },
  subsidies: {
    label: 'Subsidies',
    description: 'Proposals with a government subsidy, and their progress through the subsidy steps',
    actions: {
      view: 'View',
      update: 'Update subsidy & steps',
    },
  },
};

export const PERMISSION_AREAS = Object.keys(PERMISSION_CATALOG);

export const permissionKey = (area, action) => `${area}:${action}`;

/** True for the company owner, or a staff account that holds this permission. Pass `useSession((s) => s.user)`. */
export const can = (user, area, action) => user?.role === 'company' || user?.role === 'branch' || (user?.role === 'agent' && Array.isArray(user.permissions) && user.permissions.includes(permissionKey(area, action)));

/** Areas where `view` means "everything" and `view_team` the narrower "their team's" (same as the backend). */
export const TEAM_SCOPED_AREAS = ['clients', 'tasks'];

/** Whether this person can list anything in the area (used for navigation): everything, or their team's. */
export const canView = (user, area) => can(user, area, 'view') || (TEAM_SCOPED_AREAS.includes(area) && can(user, area, 'view_team'));

/**
 * Unique, valid, sorted — same rule as the backend (constants/permissions.js): any action brings its area's `view`
 * along, except in a team-scoped area held with `view_team`; `view_all` implies `view_team`.
 */
export function normalizePermissions(list) {
  const valid = (p) => { const [area, action] = String(p).split(':'); return Boolean(PERMISSION_CATALOG[area]?.actions[action]); };
  const given = new Set((Array.isArray(list) ? list : []).map((p) => String(p ?? '').trim()).filter(valid));
  for (const p of [...given]) if (p.endsWith(':view_all')) given.add(p.replace(/:view_all$/, ':view_team'));
  const out = new Set(given);
  for (const p of given) {
    const [area] = p.split(':');
    if (!(TEAM_SCOPED_AREAS.includes(area) && given.has(permissionKey(area, 'view_team')))) out.add(permissionKey(area, 'view'));
  }
  return [...out].sort();
}

/** "Finances · View, Record payment" style summary of one area, or '' when nothing in it is granted. */
export function areaSummary(permissions, area) {
  const actions = PERMISSION_CATALOG[area]?.actions || {};
  const on = Object.entries(actions).filter(([a]) => permissions?.includes(permissionKey(area, a))).map(([, label]) => label);
  return on.join(', ');
}

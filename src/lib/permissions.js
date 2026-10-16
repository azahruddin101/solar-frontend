// Staff permissions (`<area>:<action>`). Mirrors backend/src/constants/permissions.js — the backend test
// tests/permissions.test.js fails if the two catalogs differ. The owner can do everything; staff can do what their
// roles plus their own extra grants allow (the session's `user.permissions` already holds that union).

export const PERMISSION_CATALOG = {
  leads: {
    label: 'Leads',
    description: 'Meta, Google Ads and manually added leads — staff see the leads assigned to them unless they may view all',
    actions: {
      view: 'Assigned to them',
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
      create: 'Create',
      update: 'Edit',
      manage_login: 'Portal login',
      delete: 'Delete',
    },
  },
  finances: {
    label: 'Finances',
    description: 'Invoices, payments and receipts',
    actions: {
      view: 'View',
      create_invoice: 'Create invoice',
      create_receipt: 'Record payment',
      remove_receipt: 'Remove receipt',
    },
  },
  inventory: {
    label: 'Inventory',
    description: 'Products, catalog categories, packages and installation charges',
    actions: {
      view: 'View',
      create: 'Create',
      update: 'Edit',
      delete: 'Delete',
    },
  },
  tasks: {
    label: 'Installations',
    description: 'Every installation and its steps — staff always see the steps assigned to them',
    actions: {
      view: 'View all',
      create: 'Start',
      update: 'Edit steps',
      assign: 'Assign steps',
      change_status: 'Update step status',
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
};

export const PERMISSION_AREAS = Object.keys(PERMISSION_CATALOG);

export const permissionKey = (area, action) => `${area}:${action}`;

/** True for the company owner, or a staff account that holds this permission. Pass `useSession((s) => s.user)`. */
export const can = (user, area, action) => user?.role === 'company' || (user?.role === 'agent' && Array.isArray(user.permissions) && user.permissions.includes(permissionKey(area, action)));

/** Whether a permission list includes `view` of this area (used for navigation: a page is only useful if it can be listed). */
export const canView = (user, area) => can(user, area, 'view');

/** Unique, valid, sorted — and every action brings its area's `view` along (same rule as the backend). */
export function normalizePermissions(list) {
  const out = new Set();
  for (const p of Array.isArray(list) ? list : []) {
    const [area, action] = String(p).split(':');
    if (!PERMISSION_CATALOG[area]?.actions[action]) continue;
    out.add(p);
    out.add(permissionKey(area, 'view'));
  }
  return [...out].sort();
}

/** "Finances · View, Record payment" style summary of one area, or '' when nothing in it is granted. */
export function areaSummary(permissions, area) {
  const actions = PERMISSION_CATALOG[area]?.actions || {};
  const on = Object.entries(actions).filter(([a]) => permissions?.includes(permissionKey(area, a))).map(([, label]) => label);
  return on.join(', ');
}

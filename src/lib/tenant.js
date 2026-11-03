/** Company (org) admin vs branch owner — mirrors backend ROLES.company / ROLES.branch. */

export function isOrgAdmin(user) {
  return user?.role === 'company';
}

export function isBranchOwner(user) {
  return user?.role === 'branch';
}

/** Full access within the active branch (org admin in branch context or branch owner). */
export function hasBranchOwnerAccess(user) {
  return isOrgAdmin(user) || isBranchOwner(user);
}

/**
 * Who edits the shared masters: the company admin, or the owner of a company set up without branches (the server
 * sends `managesMasters`; see backend constants/tenant.js).
 */
export function canEditOrgMasters(user) {
  return isOrgAdmin(user) || user?.managesMasters === true;
}

/**
 * Whether this person may change the product catalog (categories, parent categories, products). The catalog is shared
 * by all branches, so in a company with branches only the company admin changes it; stock stays per branch.
 * Still subject to the inventory permissions. The server sends `editsCatalog` (backend auth.service.js userView).
 */
export function canEditCatalog(user) {
  return user?.editsCatalog !== false;
}

/** Where this person edits a master tab: the company admin on /org, an owner in their own workspace. */
export function mastersHref(user, tab) {
  if (isOrgAdmin(user)) return `/org/masters?tab=${tab}`;
  if (isBranchOwner(user)) return `/dashboard/masters?tab=${tab}`;
  return null;
}

export function roleLabel(user) {
  if (!user) return '';
  if (user.role === 'company') return 'Company admin';
  if (user.role === 'branch') return 'Branch owner';
  if (user.role === 'agent') return 'Staff';
  if (user.role === 'superadmin') return 'Super admin';
  if (user.role === 'client') return 'Client';
  return user.role;
}

/** PUT endpoints for shared masters (company admin only). */
export const ORG_MASTERS_API = {
  installationSteps: '/api/organization/installation-steps',
  amcTemplates: '/api/organization/amc-templates',
  loanSteps: '/api/organization/loan-steps',
  subsidySteps: '/api/organization/subsidy-steps',
  expenseReasons: '/api/organization/expense-reasons',
  leadForm: '/api/organization/lead-form',
  catalogSettings: '/api/organization/catalog-settings',
  companyProfile: '/api/organization',
};

export const ORG_MASTER_TAB_IDS = new Set([
  'agent-roles',
  'installation-steps',
  'amc-schedule',
  'loan-steps',
  'subsidy-steps',
  'lead-form',
  'product-units',
]);

export function tabAllowsOrgEdit(tabId) {
  return ORG_MASTER_TAB_IDS.has(tabId);
}

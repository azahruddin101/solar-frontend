/** Default agent role labels; companies edit their list under Dashboard → Agent roles. */
export const DEFAULT_AGENT_ROLES = ['Site surveyor', 'Electrician', 'Installer', 'Supervisor', 'Inspector'];
export const MAX_AGENT_ROLES = 30;

export function agentRolesFor(company) {
  const roles = company?.agentRoles;
  return Array.isArray(roles) && roles.length ? roles : DEFAULT_AGENT_ROLES;
}

export function agentRolesOf(agent) {
  if (Array.isArray(agent?.roles) && agent.roles.length) return agent.roles;
  if (agent?.jobTitle) return [agent.jobTitle];
  return [];
}

export function agentRolesLabel(agent) {
  return agentRolesOf(agent).join(' · ');
}

/** Agents who can be assigned to a step that requires `role` (all agents if no role set). */
export function agentsForStepRole(agents, role) {
  if (!role) return agents;
  const key = role.toLowerCase();
  return agents.filter((a) => agentRolesOf(a).some((r) => r.toLowerCase() === key));
}

/**
 * Company-workspace areas a staff account can be granted access to, beyond the installation steps
 * assigned to them — unrelated to the job-title `roles` above. Must mirror STAFF_PERMISSION_AREAS on
 * the backend. Access is CRUD-level within each area (see STAFF_PERMISSION_ACTIONS): a staff member can
 * be given any combination of view/create/update/delete independently, e.g. "designs:view" + "designs:create"
 * without "designs:delete".
 */
export const STAFF_PERMISSION_AREAS = [
  { id: 'designs', label: 'Proposals', description: 'Rooftop designs and proposals for clients' },
  { id: 'clients', label: 'Clients', description: 'Client records' },
  { id: 'billing', label: 'Billing', description: 'Payments and invoices' },
  { id: 'installations', label: 'Installations', description: 'Every installation, not just their own steps' },
  { id: 'catalog', label: 'Catalog', description: 'Products, categories, packages, installation charges, units and pricing' },
  { id: 'support', label: 'Support', description: 'Tickets with the platform' },
];

/** CRUD level within a granted area. 'view' is required for the other three to have any real effect. */
export const STAFF_PERMISSION_ACTIONS = [
  { id: 'view', label: 'View' },
  { id: 'create', label: 'Create' },
  { id: 'update', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
];

/** Every valid `<area>:<action>` permission string, e.g. "designs:create" — mirrors STAFF_PERMISSIONS on the backend. */
export const STAFF_PERMISSIONS = STAFF_PERMISSION_AREAS.flatMap((area) => STAFF_PERMISSION_ACTIONS.map((action) => `${area.id}:${action.id}`));

export const staffPermission = (area, action) => `${area}:${action}`;
export const hasStaffPermission = (permissions, area, action) => Array.isArray(permissions) && permissions.includes(staffPermission(area, action));
/** Whether a staff member has been given any access at all to this area (used to show/hide a whole nav section). */
export const staffHasAreaAccess = (permissions, area) => STAFF_PERMISSION_ACTIONS.some((a) => hasStaffPermission(permissions, area, a.id));

/** True for the company owner (always full access), or a staff account granted this exact action. Pass `useSession(s => s.user)`. */
export const can = (user, area, action) => user?.role === 'company' || hasStaffPermission(user?.permissions, area, action);

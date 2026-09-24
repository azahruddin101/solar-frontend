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

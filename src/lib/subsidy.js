// The government subsidy on a proposal: central + state, and the net the client pays after claiming it.
// Only a subsidy that is switched on and has an amount counts, so pages and PDFs can leave the block out otherwise.
export function subsidyOf(subsidy) {
  const central = Math.max(0, Number(subsidy?.central) || 0);
  const state = Math.max(0, Number(subsidy?.state) || 0);
  const total = Math.round((central + state) * 100) / 100;
  return { on: Boolean(subsidy?.enabled) && total > 0, central, state, total };
}

/** What is left to pay once the subsidy is claimed (never below zero). */
export const netAfterSubsidy = (total, subsidy) => Math.max(0, Math.round(((Number(total) || 0) - subsidyOf(subsidy).total) * 100) / 100);

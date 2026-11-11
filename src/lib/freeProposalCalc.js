// The sums of the free proposal maker (/free-proposal): every amount is worked out from what the visitor typed.
// The server does the same sums again when it saves (backend freeProposal.service.js `proposalTotals`).

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const n = (v, max = 1e12) => {
  const x = Number(v);
  return v !== '' && v != null && Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0;
};

/** One line: quantity × rate. */
export const lineAmount = (it) => round2(n(it?.qty) * n(it?.rate));

/**
 * The money of a proposal: the lines add up to the subtotal; the discount comes off every line in proportion; each
 * line's own tax is added; the subsidy (if any) is shown under the total.
 */
export function proposalTotals(items = [], pricing = {}) {
  const lines = items.map((it) => ({ amount: lineAmount(it), taxPercent: n(it.taxPercent, 100) }));
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0));
  const discountAmount = round2(Math.min(subtotal, pricing.discountIsPercent ? (subtotal * n(pricing.discount, 100)) / 100 : n(pricing.discount)));
  const keep = subtotal > 0 ? 1 - discountAmount / subtotal : 1;
  const taxable = round2(subtotal - discountAmount);
  const tax = round2(lines.reduce((a, l) => a + (l.amount * keep * l.taxPercent) / 100, 0));
  const total = round2(taxable + tax);
  const subsidy = round2(Math.min(total, n(pricing.subsidy)));
  return { subtotal, discountAmount, taxable, tax, total, subsidy, net: round2(total - subsidy) };
}

/** What the system earns back, from the yearly energy and tariff the visitor gave (0.5% less energy each year). */
export function proposalSavings(system = {}, cost = 0, years = 25) {
  const yearly = round2(n(system.annualKwh) * n(system.tariff));
  let lifetime = 0;
  const rows = [];
  for (let y = 0; y < years; y++) {
    lifetime += yearly * 0.995 ** y;
    rows.push(lifetime);
  }
  return { firstYearSavings: yearly, payback: yearly > 0 && cost > 0 ? cost / yearly : 0, lifetimeSavings: round2(lifetime), netGain: round2(lifetime - cost), rows, years };
}

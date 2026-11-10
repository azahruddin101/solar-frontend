// The company's tax: its name on screens and PDFs (GST, VAT, Sales tax…) and the rate new items start
// with. Set once per company in Settings (Company profile); every rate stays editable item by item.
// Only GST is split into CGST + SGST (India); any other tax is one line.
import { useSession } from './session.js';

export const DEFAULT_TAX = { label: 'GST', rate: 18 };

/** { label, rate, isGst, idLabel } for a company object (session company, or one passed to a PDF). */
export function taxOf(company) {
  const label = String(company?.taxLabel || '').trim() || DEFAULT_TAX.label;
  const r = Number(company?.taxRate);
  const isGst = label.toUpperCase() === 'GST';
  return {
    label,
    rate: Number.isFinite(r) && r >= 0 && r <= 100 && company?.taxRate !== '' && company?.taxRate != null ? r : DEFAULT_TAX.rate,
    isGst,
    idLabel: isGst ? 'GSTIN' : `${label} number`, // the tax registration number's name
  };
}

/** The signed-in company's tax, for code outside React (pricing defaults, PDFs). */
export const currentTax = () => taxOf(useSession.getState().company);

/** The signed-in company's tax, in a component. */
export function useTax() {
  const company = useSession((s) => s.company);
  return taxOf(company);
}

/** The default rate for a new line: the company's (the "18" that used to be written everywhere). */
export const defaultTaxRate = () => currentTax().rate;

/** "GST", "VAT"…: the signed-in company's tax name, for labels. */
export const taxName = () => currentTax().label;

/**
 * The tax lines under a total: CGST + SGST (half each) for GST, one line otherwise.
 * `amounts` = { gst | total, cgst, sgst }; `rate` = the whole rate when known (for "@ 9%").
 */
export function taxLines(tax, amounts, rate = null) {
  const total = Number(amounts?.gst ?? amounts?.total ?? (Number(amounts?.cgst || 0) + Number(amounts?.sgst || 0))) || 0;
  const at = (r) => (r != null && r > 0 ? ` @ ${r}%` : '');
  if (tax.isGst) return [[`CGST${at(rate != null ? rate / 2 : null)}`, amounts?.cgst ?? total / 2], [`SGST${at(rate != null ? rate / 2 : null)}`, amounts?.sgst ?? total / 2]];
  return [[`${tax.label}${at(rate)}`, total]];
}

/** "GSTIN", "VAT number"…: the name of the tax registration number. */
export const taxIdName = () => currentTax().idLabel;

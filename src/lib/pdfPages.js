// The parts of the proposal PDF the user can pick at download. `generatePdf({ pages })` builds only
// the chosen ones; leaving `pages` out builds them all. The shadow analysis is not built by
// generatePdf itself: picking it runs the shadow report and appends it (the "combined" download).
// The last choice is remembered in this browser.

export const PDF_PAGES = [
  { id: 'cover', name: 'Front page', hint: 'Cover with the 3D picture' },
  { id: 'summary', name: 'Proposal summary', hint: 'Letter, key figures, system at a glance' },
  { id: 'details', name: 'System details', hint: 'Roof, array orientation, mounting' },
  { id: 'layout', name: 'Layout drawings', hint: 'Panel layout and string layout' },
  { id: 'sld', name: 'Single line diagram', hint: 'Whole system wiring' },
  { id: 'stringSld', name: 'Diagram per string', hint: 'One wiring sheet for each string' },
  { id: 'electrical', name: 'Electrical design', hint: 'Inverter and string table' },
  { id: 'energy', name: 'Energy & financials', hint: 'Monthly energy, payback chart' },
  { id: 'monthly', name: 'Monthly outlook', hint: 'Month-by-month savings table' },
  { id: 'price', name: 'Price & acceptance', hint: 'Bill of materials, total, sign-off' },
  { id: 'bank', name: 'Bank details', hint: 'Account details and payment QR code' },
  { id: 'shadow', name: 'Shadow analysis', hint: 'Hour-by-hour shading (takes a minute)', needs3d: true },
];

export const ALL_PAGES = PDF_PAGES.map((p) => p.id);
const DEFAULT_PAGES = ALL_PAGES.filter((id) => id !== 'shadow');
const KEY = 'innovbit.pdfPages';

// choices saved before "Bank details" existed: it was always printed then, so it stays picked
const added = ['bank'];

export function lastPages() {
  try {
    let saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (Array.isArray(saved) && !window.localStorage.getItem(`${KEY}.v2`)) saved = [...saved, ...added.filter((id) => !saved.includes(id))];
    const ok = Array.isArray(saved) ? saved.filter((id) => ALL_PAGES.includes(id)) : [];
    return ok.length ? ok : DEFAULT_PAGES;
  } catch {
    return DEFAULT_PAGES;
  }
}

export function rememberPages(ids) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
    window.localStorage.setItem(`${KEY}.v2`, '1');
  } catch {
    /* private mode or blocked storage: the choice simply is not remembered */
  }
}

/** Every proposal page (everything but the shadow analysis) is in the choice: the full proposal. */
export const isFullProposal = (ids) => !ids || DEFAULT_PAGES.every((id) => ids.includes(id));

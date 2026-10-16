// How each workspace area looks in the staff and role screens — one colour and icon per area, used everywhere — and
// what each permission means in everyday words (for the "This person can…" summaries).
// Class names are written out in full so Tailwind keeps them.
import { Boxes, HardHat, Headset, LifeBuoy, Megaphone, PenTool, Receipt, Users } from 'lucide-react';

export const AREA_STYLE = {
  leads: { icon: Megaphone, chip: 'bg-rose-100 text-rose-700', on: 'border-rose-600 bg-rose-600 text-white', pill: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'border-l-rose-400', soft: 'bg-rose-50/60' },
  proposals: { icon: PenTool, chip: 'bg-violet-100 text-violet-700', on: 'border-violet-600 bg-violet-600 text-white', pill: 'bg-violet-50 text-violet-700 ring-violet-200', bar: 'border-l-violet-400', soft: 'bg-violet-50/60' },
  clients: { icon: Users, chip: 'bg-sky-100 text-sky-700', on: 'border-sky-600 bg-sky-600 text-white', pill: 'bg-sky-50 text-sky-700 ring-sky-200', bar: 'border-l-sky-400', soft: 'bg-sky-50/60' },
  finances: { icon: Receipt, chip: 'bg-emerald-100 text-emerald-700', on: 'border-emerald-600 bg-emerald-600 text-white', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'border-l-emerald-400', soft: 'bg-emerald-50/60' },
  inventory: { icon: Boxes, chip: 'bg-amber-100 text-amber-700', on: 'border-amber-500 bg-amber-500 text-white', pill: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'border-l-amber-400', soft: 'bg-amber-50/60' },
  tasks: { icon: HardHat, chip: 'bg-orange-100 text-orange-700', on: 'border-orange-600 bg-orange-600 text-white', pill: 'bg-orange-50 text-orange-700 ring-orange-200', bar: 'border-l-orange-400', soft: 'bg-orange-50/60' },
  support: { icon: LifeBuoy, chip: 'bg-slate-200 text-slate-700', on: 'border-slate-700 bg-slate-700 text-white', pill: 'bg-slate-100 text-slate-700 ring-slate-200', bar: 'border-l-slate-400', soft: 'bg-slate-50' },
  helpdesk: { icon: Headset, chip: 'bg-teal-100 text-teal-700', on: 'border-teal-600 bg-teal-600 text-white', pill: 'bg-teal-50 text-teal-700 ring-teal-200', bar: 'border-l-teal-400', soft: 'bg-teal-50/60' },
};

/** What a permission lets someone do, in plain words. */
export const PLAIN = {
  leads: { view: 'See the leads given to them', view_all: 'See every lead', create: 'Add leads and import them from Excel', change_status: 'Update a lead’s status', update: 'Edit lead details and mark priority', assign: 'Give leads to other staff', export: 'Download leads to Excel' },
  proposals: { view: 'Open proposals', create: 'Make new proposals', update: 'Edit proposals', change_status: 'Mark proposals won or lost', change_client: 'Move a proposal to another client', share: 'Share proposal links with clients', delete: 'Delete proposals' },
  clients: { view: 'See client details', create: 'Add new clients', update: 'Edit client details', manage_login: 'Set up a client’s portal login', delete: 'Delete clients' },
  finances: { view: 'See payments and invoices', create_invoice: 'Make invoices', create_receipt: 'Record payments and give receipts', remove_receipt: 'Remove a wrong receipt' },
  inventory: { view: 'See products and packages', create: 'Add products and packages', update: 'Edit products and prices', delete: 'Delete products' },
  tasks: { view: 'See every installation', create: 'Start installations', update: 'Edit installation steps', assign: 'Give installation steps to staff', change_status: 'Mark installation steps done', delete: 'Delete installations' },
  support: { view: 'See support tickets with the platform', create: 'Open support tickets with the platform', update: 'Reply to and close platform tickets' },
  helpdesk: { view: 'See clients’ help requests', update: 'Reply to clients and update their requests' },
};

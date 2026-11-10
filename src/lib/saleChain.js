// Billing as the screens show it: bills (with their delivery challan) and receipts; older invoices are read-only.
// Who a document is for, and how each status reads.
export const partyQuery = (party) => (party?.design ? `design=${party.design}` : party?.client ? `client=${party.client}` : '');

export const EWAY_STATUS = {
  open: { label: 'Issued', tone: 'green', hint: 'The bill stands; it can still be cancelled or partly returned (bills made since 2026-11-10 show Paid)' },
  billed: { label: 'Invoiced', tone: 'green', hint: 'Paid on an older invoice' },
  cancelled: { label: 'Cancelled', tone: 'slate', hint: 'Goods went back into stock' },
  superseded: { label: 'Revised', tone: 'slate', hint: 'Replaced by a newer bill — view only' },
};

export const BILL_STATUS = {
  paid: { label: 'Paid', tone: 'green', hint: 'Issued and paid' },
  invoiced: { label: 'On an older invoice', tone: 'green', hint: 'Consolidated on an older invoice' },
  void: { label: 'Void', tone: 'slate', hint: 'Struck off by the owner; kept as the record' },
};

/** The billing page of a party: the proposal's, or the client's when there is no proposal. */
export const partyBillingHref = (basePath, { design, client }) => (design ? `${basePath}/${design}` : `${basePath}/client/${client}`);

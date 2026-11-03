// The sale chain (bill → invoice; older invoices are read-only) as the billing screens show it: who a document is for, and how each
// status reads.
export const partyQuery = (party) => (party?.design ? `design=${party.design}` : party?.client ? `client=${party.client}` : '');

export const EWAY_STATUS = {
  open: { label: 'Open', tone: 'amber', hint: 'Goods are out; not on an invoice yet' },
  billed: { label: 'Invoiced', tone: 'green', hint: 'Paid on an invoice' },
  cancelled: { label: 'Cancelled', tone: 'slate', hint: 'Goods went back into stock' },
};

export const BILL_STATUS = {
  paid: { label: 'Paid', tone: 'green', hint: 'Issued and paid' },
  invoiced: { label: 'On an older invoice', tone: 'green', hint: 'Consolidated on an older invoice' },
  void: { label: 'Void', tone: 'slate', hint: 'Struck off by the owner; kept as the record' },
};

/** The billing page of a party: the proposal's, or the client's when there is no proposal. */
export const partyBillingHref = (basePath, { design, client }) => (design ? `${basePath}/${design}` : `${basePath}/client/${client}`);

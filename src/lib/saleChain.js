// The sale chain (e-way bill → bill → invoice) as the billing screens show it: who a document is for, and how each
// status reads.
export const partyQuery = (party) => (party?.design ? `design=${party.design}` : party?.client ? `client=${party.client}` : '');

export const EWAY_STATUS = {
  open: { label: 'Open', tone: 'amber', hint: 'Goods are out; not on a bill yet' },
  billed: { label: 'Billed', tone: 'green', hint: 'Paid on a bill' },
  cancelled: { label: 'Cancelled', tone: 'slate', hint: 'Goods went back into stock' },
};

export const BILL_STATUS = {
  paid: { label: 'Paid', tone: 'amber', hint: 'Paid; not on an invoice yet' },
  invoiced: { label: 'Invoiced', tone: 'green', hint: 'On an invoice' },
  void: { label: 'Void', tone: 'slate', hint: 'Struck off by the owner; kept as the record' },
};

/** The billing page of a party: the proposal's, or the client's when there is no proposal. */
export const partyBillingHref = (basePath, { design, client }) => (design ? `${basePath}/${design}` : `${basePath}/client/${client}`);

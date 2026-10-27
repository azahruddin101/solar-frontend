// The optional reference & delivery details of an invoice (see backend Invoice.details): their form fields, in the
// order they are asked for and printed.
export const INVOICE_DETAIL_FIELDS = [
  { key: 'reference', label: 'Reference No. & date', placeholder: 'e.g. REF-104 / 2 Oct 2026' },
  { key: 'otherReferences', label: 'Other References' },
  { key: 'buyerOrderNo', label: 'Buyer’s Order No.' },
  { key: 'buyerOrderDate', label: 'Dated', pdfLabel: 'Order dated', type: 'date' },
  { key: 'dispatchDocNo', label: 'Dispatch Doc No.' },
  { key: 'deliveryNoteDate', label: 'Delivery Note Date', type: 'date' },
  { key: 'dispatchedThrough', label: 'Dispatched Through' },
  { key: 'destination', label: 'Destination' },
  { key: 'termsOfDelivery', label: 'Terms of Delivery', full: true },
];

export const EMPTY_INVOICE_DETAILS = Object.fromEntries(INVOICE_DETAIL_FIELDS.map((f) => [f.key, '']));

/** [label, value] rows for the filled-in details only, in order; `date(value)` formats the two date fields. */
export function invoiceDetailRows(details, date = (v) => v) {
  return INVOICE_DETAIL_FIELDS
    .filter((f) => String(details?.[f.key] ?? '').trim())
    .map((f) => [f.pdfLabel || f.label, f.type === 'date' ? date(details[f.key]) : String(details[f.key]).trim()]);
}

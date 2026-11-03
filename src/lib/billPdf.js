'use client';

// The invoice (backend Bill): goods from one or more bills plus services, with GST and an optional discount — paid in
// full when it is made. It prints as the tax invoice (invoicePdf.js), numbered with the company's invoice numbering.
import { buildInvoicePdfBlob } from './invoicePdf.js';

/** A Bill-model row as the invoice PDF reads it: billNo is the invoice number; its bills are listed by number. */
export function billAsInvoice(bill) {
  const pricing = bill.pricing || {};
  const ewayBills = Array.isArray(bill.ewayBills) ? bill.ewayBills.filter((e) => e && typeof e === 'object') : [];
  return {
    ...bill,
    invoiceNo: bill.billNo,
    billRefs: undefined,
    ewayNos: ewayBills.map((e) => e.ewayNo).filter(Boolean),
    paid: bill.paid || {},
    pricing: {
      ...pricing,
      total: Number(pricing.total ?? bill.total) || 0,
      frozen: true,
      // a service whose description repeats its name prints once
      lines: (pricing.lines || []).map((l) => (l && String(l.detail || '').trim() === String(l.name || '').trim() ? { ...l, detail: '' } : l)),
    },
  };
}

/** Build the invoice PDF bytes of a Bill-model row. `client` is the client record (or the row's bill-to copy). */
export async function buildBillPdfBlob({ bill, company = {}, client = {}, currency = 'INR' }) {
  return buildInvoicePdfBlob({ invoice: billAsInvoice(bill), company, client, currency });
}

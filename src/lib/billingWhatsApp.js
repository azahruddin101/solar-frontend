'use client';

import { api } from './api.js';
import { buildInvoicePdfBlob } from './billingPdf.js';
import { buildBillPdfBlob } from './billPdf.js';
import { buildEwayBillPdfBlob } from './ewayBillPdf.js';
import { shareableFileUrl } from './files.js';
import { shareLinkOnWhatsApp } from './whatsapp.js';

function uploadPath(pdfName) {
  return pdfName.startsWith('/uploads/') ? pdfName : `/uploads/${pdfName}`;
}

async function uploadInvoicePdf(invoiceId, blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await api(`/api/billing/invoices/${invoiceId}/pdf`, { method: 'POST', form });
  return res.pdfName;
}

async function ensureInvoiceStored(params) {
  const { invoice } = params;
  if (invoice.pdfName) return invoice.pdfName;
  const { blob, filename } = await buildInvoicePdfBlob(params);
  return uploadInvoicePdf(invoice.id, blob, filename);
}

export async function shareInvoiceOnWhatsApp(params) {
  const { invoice, client } = params;
  const pdfName = await ensureInvoiceStored(params);
  const pdfUrl = await shareableFileUrl(uploadPath(pdfName));
  shareLinkOnWhatsApp({
    phone: client?.phone,
    pdfUrl,
    message: `Hi${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, here is invoice ${invoice.invoiceNo}${invoice.title ? ` for ${invoice.title}` : ''}.`,
  });
  return pdfName;
}

async function uploadPdf(path, blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await api(path, { method: 'POST', form });
  return res.pdfName;
}

export async function shareBillOnWhatsApp({ bill, company, client, currency }) {
  const pdfName = bill.pdfName || await (async () => {
    const { blob, filename } = await buildBillPdfBlob({ bill, company, client, currency });
    return uploadPdf(`/api/billing/bills/${bill.id}/pdf`, blob, filename);
  })();
  const pdfUrl = await shareableFileUrl(uploadPath(pdfName));
  shareLinkOnWhatsApp({
    phone: client?.phone,
    pdfUrl,
    message: `Hi${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, here is your bill ${bill.billNo}${bill.title ? ` for ${bill.title}` : ''}. Thank you for your payment.`,
  });
  return pdfName;
}

export async function shareEwayBillOnWhatsApp({ ewayBill, company, client, currency }) {
  const pdfName = ewayBill.pdfName || await (async () => {
    const { blob, filename } = await buildEwayBillPdfBlob({ ewayBill, company, client, currency });
    return uploadPdf(`/api/billing/eway-bills/${ewayBill.id}/pdf`, blob, filename);
  })();
  const pdfUrl = await shareableFileUrl(uploadPath(pdfName));
  shareLinkOnWhatsApp({
    phone: client?.phone,
    pdfUrl,
    message: `Hi${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, here is the e-way bill ${ewayBill.ewayNo} for the goods dispatched${ewayBill.title ? ` for ${ewayBill.title}` : ''}.`,
  });
  return pdfName;
}

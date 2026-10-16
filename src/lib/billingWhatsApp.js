'use client';

import { api } from './api.js';
import { buildInvoicePdfBlob, buildReceiptPdfBlob } from './billingPdf.js';
import { shareableFileUrl } from './files.js';
import { shareLinkOnWhatsApp } from './whatsapp.js';

function uploadPath(pdfName) {
  return pdfName.startsWith('/uploads/') ? pdfName : `/uploads/${pdfName}`;
}

async function uploadReceiptPdf(paymentId, blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await api(`/api/billing/payments/${paymentId}/pdf`, { method: 'POST', form });
  return res.pdfName;
}

async function uploadInvoicePdf(invoiceId, blob, filename) {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await api(`/api/billing/invoices/${invoiceId}/pdf`, { method: 'POST', form });
  return res.pdfName;
}

async function ensureReceiptStored({ payment, proposalName, total, history, company, client, currency }) {
  if (payment.pdfName) return payment.pdfName;
  const { blob, filename } = await buildReceiptPdfBlob({ payment, proposalName, total, history, company, client, currency });
  return uploadReceiptPdf(payment.id, blob, filename);
}

async function ensureInvoiceStored(params) {
  const { invoice } = params;
  if (invoice.pdfName) return invoice.pdfName;
  const { blob, filename } = await buildInvoicePdfBlob(params);
  return uploadInvoicePdf(invoice.id, blob, filename);
}

export async function shareReceiptOnWhatsApp({ payment, proposalName, total, history, company, client, currency }) {
  const pdfName = await ensureReceiptStored({ payment, proposalName, total, history, company, client, currency });
  const pdfUrl = await shareableFileUrl(uploadPath(pdfName));
  shareLinkOnWhatsApp({
    phone: client?.phone,
    pdfUrl,
    message: `Hi${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, here is your payment receipt ${payment.receiptNo} for ${proposalName}.`,
  });
  return pdfName;
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

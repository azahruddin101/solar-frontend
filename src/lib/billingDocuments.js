'use client';

import { openPdfViewer } from '@/components/kit';
import { buildReceiptPdfBlob } from './billingPdf';
import { buildInvoicePdfBlob, downloadBlob } from './invoicePdf';
import { signedFileUrl } from './files';

export async function viewStoredPdf(pdfName, title = 'PDF') {
  if (!pdfName) return false;
  const signed = await signedFileUrl(`/uploads/${pdfName}`);
  openPdfViewer({ title, src: signed, downloadName: pdfName });
  return true;
}

export async function downloadStoredPdf(pdfName, filename) {
  const signed = await signedFileUrl(`/uploads/${pdfName}`);
  const res = await fetch(signed);
  if (!res.ok) throw new Error('Could not download PDF');
  downloadBlob(await res.blob(), filename || pdfName);
}

export async function viewReceiptDocument({ payment, pdfName, proposalName, total, history, company, client, currency }) {
  const title = `Receipt ${payment.receiptNo}`;
  if (pdfName) return viewStoredPdf(pdfName, title);
  const { blob, filename } = await buildReceiptPdfBlob({ payment, proposalName, total, history, company, client, currency });
  openPdfViewer({ title, blob, downloadName: filename });
}

export async function downloadReceiptDocument({ payment, pdfName, proposalName, total, history, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `receipt_${payment.receiptNo}.pdf`);
  const { blob, filename } = await buildReceiptPdfBlob({ payment, proposalName, total, history, company, client, currency });
  downloadBlob(blob, filename);
}

export async function viewInvoiceDocument({ invoice, pdfName, payments, company, client, currency, quote, proposalPricing, catalog, packages }) {
  const title = `Invoice ${invoice.invoiceNo}`;
  if (pdfName) return viewStoredPdf(pdfName, title);
  const { blob, filename } = await buildInvoicePdfBlob({ invoice, payments, company, client, currency, quote, proposalPricing, catalog, packages });
  openPdfViewer({ title, blob, downloadName: filename });
}

export async function downloadInvoiceDocument({ invoice, pdfName, payments, company, client, currency, quote, proposalPricing, catalog, packages }) {
  if (pdfName) return downloadStoredPdf(pdfName, `invoice_${invoice.invoiceNo}.pdf`);
  const { blob, filename } = await buildInvoicePdfBlob({ invoice, payments, company, client, currency, quote, proposalPricing, catalog, packages });
  downloadBlob(blob, filename);
}

'use client';

import { openPdfViewer } from '@/components/kit';
import { buildInvoicePdfBlob, downloadBlob } from './invoicePdf';
import { buildEwayBillPdfBlob } from './ewayBillPdf';
import { buildBillPdfBlob } from './billPdf';
import { buildCreditNotePdfBlob } from './creditNotePdf';
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

export async function viewEwayBillDocument({ ewayBill, pdfName, company, client, currency }) {
  const title = `E-way bill ${ewayBill.ewayNo}`;
  if (pdfName) return viewStoredPdf(pdfName, title);
  const { blob, filename } = await buildEwayBillPdfBlob({ ewayBill, company, client, currency });
  openPdfViewer({ title, blob, downloadName: filename });
}

export async function downloadEwayBillDocument({ ewayBill, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `eway-bill_${ewayBill.ewayNo}.pdf`);
  const { blob, filename } = await buildEwayBillPdfBlob({ ewayBill, company, client, currency });
  downloadBlob(blob, filename);
}

export async function viewBillDocument({ bill, pdfName, company, client, currency }) {
  const title = `Bill ${bill.billNo}`;
  if (pdfName) return viewStoredPdf(pdfName, title);
  const { blob, filename } = await buildBillPdfBlob({ bill, company, client, currency });
  openPdfViewer({ title, blob, downloadName: filename });
}

export async function downloadBillDocument({ bill, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `bill_${bill.billNo}.pdf`);
  const { blob, filename } = await buildBillPdfBlob({ bill, company, client, currency });
  downloadBlob(blob, filename);
}

export async function viewCreditNoteDocument({ note, pdfName, company, client, currency }) {
  const title = `Credit note ${note.creditNo}`;
  if (pdfName) return viewStoredPdf(pdfName, title);
  const { blob, filename } = await buildCreditNotePdfBlob({ note, company, client, currency });
  openPdfViewer({ title, blob, downloadName: filename });
}

export async function downloadCreditNoteDocument({ note, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `credit-note_${note.creditNo}.pdf`);
  const { blob, filename } = await buildCreditNotePdfBlob({ note, company, client, currency });
  downloadBlob(blob, filename);
}

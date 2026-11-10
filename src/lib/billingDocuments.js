'use client';

import { closePdfViewer, openPdfViewer, openPdfViewerLoading } from '@/components/kit';
import { api } from './api';
import { buildInvoicePdfBlob, downloadBlob } from './invoicePdf';
import { buildChallanPdfBlob, buildEwayBillPdfBlob, challanNoOf } from './ewayBillPdf';
import { buildReceiptPdfBlob } from './receiptPdf';
import { buildBillPdfBlob } from './billPdf';
import { buildCreditNotePdfBlob } from './creditNotePdf';
import { signedFileUrl } from './files';

/** Store a generated PDF on the server; retries once (409 = already stored). */
export async function uploadBillingPdf(path, blob, filename) {
  const post = () => {
    const form = new FormData();
    form.append('file', blob, filename);
    return api(path, { method: 'POST', form });
  };
  try {
    await post();
  } catch (first) {
    if (first?.status === 409) return;
    await new Promise((resolve) => setTimeout(resolve, 800));
    await post();
  }
}

async function archiveIfMissing(pdfName, uploadPath, build) {
  if (pdfName) return;
  const { blob, filename } = await build();
  await uploadBillingPdf(uploadPath, blob, filename);
}

export async function archiveEwayBillPdf(ewayBill, company, client, currency) {
  if (ewayBill?.pdfName) return;
  await archiveIfMissing(null, `/api/billing/eway-bills/${ewayBill.id}/pdf`, () => buildEwayBillPdfBlob({ ewayBill, company, client, currency }));
}

export async function archiveBillPdf(bill, company, client, currency) {
  if (bill?.pdfName) return;
  await archiveIfMissing(null, `/api/billing/bills/${bill.id}/pdf`, () => buildBillPdfBlob({ bill, company, client, currency }));
}

export async function archiveCreditNotePdf(note, company, client, currency) {
  if (note?.pdfName) return;
  await archiveIfMissing(null, `/api/billing/credit-notes/${note.id}/pdf`, () => buildCreditNotePdfBlob({ note, company, client, currency }));
}

export async function archiveInvoicePdf(invoice, params) {
  if (invoice?.pdfName) return;
  await archiveIfMissing(null, `/api/billing/invoices/${invoice.id}/pdf`, () => buildInvoicePdfBlob(params));
}

async function loadStoredPdfBlob(pdfName) {
  const signed = await signedFileUrl(`/uploads/${pdfName}`);
  const res = await fetch(signed);
  if (!res.ok) throw new Error('Could not open PDF');
  return res.blob();
}

export async function viewStoredPdf(pdfName, title = 'PDF') {
  if (!pdfName) return false;
  openPdfViewerLoading(title);
  try {
    const blob = await loadStoredPdfBlob(pdfName);
    openPdfViewer({ title, blob, downloadName: pdfName });
    return true;
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadStoredPdf(pdfName, filename) {
  const signed = await signedFileUrl(`/uploads/${pdfName}`);
  const res = await fetch(signed);
  if (!res.ok) throw new Error('Could not download PDF');
  downloadBlob(await res.blob(), filename || pdfName);
}

export async function viewInvoiceDocument(params) {
  const { invoice, pdfName, payments, company, client, currency, quote, proposalPricing, catalog, packages } = params;
  const title = `Invoice ${invoice.invoiceNo}`;
  openPdfViewerLoading(title);
  try {
    if (pdfName) {
      const blob = await loadStoredPdfBlob(pdfName);
      openPdfViewer({ title, blob, downloadName: pdfName });
      return;
    }
    const built = { invoice, payments, company, client, currency, quote, proposalPricing, catalog, packages };
    const { blob, filename } = await buildInvoicePdfBlob(built);
    await uploadBillingPdf(`/api/billing/invoices/${invoice.id}/pdf`, blob, filename).catch(() => {});
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadInvoiceDocument(params) {
  const { invoice, pdfName, payments, company, client, currency, quote, proposalPricing, catalog, packages } = params;
  if (pdfName) return downloadStoredPdf(pdfName, `invoice_${invoice.invoiceNo}.pdf`);
  const built = { invoice, payments, company, client, currency, quote, proposalPricing, catalog, packages };
  const { blob, filename } = await buildInvoicePdfBlob(built);
  await uploadBillingPdf(`/api/billing/invoices/${invoice.id}/pdf`, blob, filename);
  downloadBlob(blob, filename);
}

export async function viewEwayBillDocument({ ewayBill, pdfName, company, client, currency }) {
  const title = `Bill ${ewayBill.ewayNo}`;
  openPdfViewerLoading(title);
  try {
    if (pdfName) {
      const blob = await loadStoredPdfBlob(pdfName);
      openPdfViewer({ title, blob, downloadName: pdfName });
      return;
    }
    const built = { ewayBill, company, client, currency };
    const { blob, filename } = await buildEwayBillPdfBlob(built);
    await uploadBillingPdf(`/api/billing/eway-bills/${ewayBill.id}/pdf`, blob, filename).catch(() => {});
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadEwayBillDocument({ ewayBill, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `bill_${ewayBill.ewayNo}.pdf`);
  const built = { ewayBill, company, client, currency };
  const { blob, filename } = await buildEwayBillPdfBlob(built);
  await uploadBillingPdf(`/api/billing/eway-bills/${ewayBill.id}/pdf`, blob, filename);
  downloadBlob(blob, filename);
}

export async function viewBillDocument({ bill, pdfName, company, client, currency }) {
  const title = `Invoice ${bill.billNo}`;
  openPdfViewerLoading(title);
  try {
    if (pdfName) {
      const blob = await loadStoredPdfBlob(pdfName);
      openPdfViewer({ title, blob, downloadName: pdfName });
      return;
    }
    const built = { bill, company, client, currency };
    const { blob, filename } = await buildBillPdfBlob(built);
    await uploadBillingPdf(`/api/billing/bills/${bill.id}/pdf`, blob, filename).catch(() => {});
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadBillDocument({ bill, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `invoice_${bill.billNo}.pdf`);
  const built = { bill, company, client, currency };
  const { blob, filename } = await buildBillPdfBlob(built);
  await uploadBillingPdf(`/api/billing/bills/${bill.id}/pdf`, blob, filename);
  downloadBlob(blob, filename);
}

export async function viewCreditNoteDocument({ note, pdfName, company, client, currency }) {
  const title = `Credit note ${note.creditNo}`;
  openPdfViewerLoading(title);
  try {
    if (pdfName) {
      const blob = await loadStoredPdfBlob(pdfName);
      openPdfViewer({ title, blob, downloadName: pdfName });
      return;
    }
    const built = { note, company, client, currency };
    const { blob, filename } = await buildCreditNotePdfBlob(built);
    await uploadBillingPdf(`/api/billing/credit-notes/${note.id}/pdf`, blob, filename).catch(() => {});
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadCreditNoteDocument({ note, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `credit-note_${note.creditNo}.pdf`);
  const built = { note, company, client, currency };
  const { blob, filename } = await buildCreditNotePdfBlob(built);
  await uploadBillingPdf(`/api/billing/credit-notes/${note.id}/pdf`, blob, filename);
  downloadBlob(blob, filename);
}

/** The delivery challan of a bill. It is printed from the saved bill each time (nothing extra is stored for it). */
export async function viewChallanDocument({ ewayBill, company, client, currency }) {
  const title = `Delivery challan ${challanNoOf(ewayBill.ewayNo)}`;
  openPdfViewerLoading(title);
  try {
    const { blob, filename } = await buildChallanPdfBlob({ ewayBill, company, client, currency });
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadChallanDocument({ ewayBill, company, client, currency }) {
  const { blob, filename } = await buildChallanPdfBlob({ ewayBill, company, client, currency });
  downloadBlob(blob, filename);
}

export async function archiveReceiptPdf(receipt, company, client, currency) {
  if (receipt?.pdfName) return;
  await archiveIfMissing(null, `/api/billing/receipts/${receipt.id}/pdf`, () => buildReceiptPdfBlob({ receipt, company, client, currency }));
}

export async function viewReceiptDocument({ receipt, pdfName, company, client, currency }) {
  const title = `Receipt ${receipt.receiptNo}`;
  openPdfViewerLoading(title);
  try {
    if (pdfName) {
      const blob = await loadStoredPdfBlob(pdfName);
      openPdfViewer({ title, blob, downloadName: pdfName });
      return;
    }
    const { blob, filename } = await buildReceiptPdfBlob({ receipt, company, client, currency });
    await uploadBillingPdf(`/api/billing/receipts/${receipt.id}/pdf`, blob, filename).catch(() => {});
    openPdfViewer({ title, blob, downloadName: filename });
  } catch (e) {
    closePdfViewer();
    throw e;
  }
}

export async function downloadReceiptDocument({ receipt, pdfName, company, client, currency }) {
  if (pdfName) return downloadStoredPdf(pdfName, `receipt_${receipt.receiptNo}.pdf`);
  const { blob, filename } = await buildReceiptPdfBlob({ receipt, company, client, currency });
  await uploadBillingPdf(`/api/billing/receipts/${receipt.id}/pdf`, blob, filename).catch(() => {});
  downloadBlob(blob, filename);
}

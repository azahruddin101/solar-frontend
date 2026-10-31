'use client';

// Open an expense bill (PDF / image in the in-page viewer; Excel downloads).
import { signedFileUrl } from '@/lib/files';
import { openImage, openPdfViewer, showError } from '@/components/kit';

export const BILL_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
export const BILL_ALLOWED = /\.(pdf|png|jpe?g|webp|xlsx|xls)$/i;
export const MAX_BILL_BYTES = 20 * 1024 * 1024;

const extOf = (url, name) => (String(url || name).match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();

export function billKind({ url, name }) {
  const ext = extOf(url, name);
  if (/^\.xlsx?$/.test(ext)) return 'sheet';
  if (/^\.(png|jpe?g|webp)$/.test(ext)) return 'image';
  return 'pdf';
}

async function billLink({ url, name }, { download } = {}) {
  const link = new URL(await signedFileUrl(url), window.location.href);
  if (download) link.searchParams.set('download', name || 'Bill');
  return link.href;
}

async function downloadBill(bill) {
  try {
    const a = document.createElement('a');
    a.href = await billLink(bill, { download: true });
    a.rel = 'noopener';
    a.click();
  } catch (e) {
    showError(e, 'The bill could not be downloaded');
  }
}

/** PDFs and images open in the in-page viewer; Excel downloads. */
export async function viewExpenseBill(bill) {
  if (!bill?.url) return;
  const kind = billKind(bill);
  if (kind === 'sheet') return downloadBill(bill);
  try {
    const title = bill.name || 'Bill';
    if (kind === 'image') openImage(await billLink(bill), title);
    else {
      openPdfViewer({
        title,
        src: await billLink(bill),
        downloadSrc: await billLink(bill, { download: true }),
        downloadName: title,
      });
    }
  } catch (e) {
    showError(e, 'The bill could not be opened');
  }
}

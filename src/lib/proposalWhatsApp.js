'use client';

import { api } from './api.js';
import { shareableFileUrl } from './files.js';
import { shareLinkOnWhatsApp } from './whatsapp.js';

/** Share an archived quotation PDF (version history) with the client on WhatsApp. */
export async function shareProposalVersionOnWhatsApp({ pdfName, proposalName, client }) {
  const path = pdfName.startsWith('/uploads/') ? pdfName : `/uploads/${pdfName}`;
  const pdfUrl = await shareableFileUrl(path);
  shareLinkOnWhatsApp({
    phone: client?.phone,
    pdfUrl,
    message: `Hi${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, here is the proposal${proposalName ? ` for ${proposalName}` : ''}.`,
  });
}

/** Generate in the editor → archive as a version → open WhatsApp with the public PDF link. */
export async function archiveProposalPdfAndShareOnWhatsApp({ designId, blob, filename, proposalName, client }) {
  if (!designId) throw new Error('Save the proposal before sharing.');
  if (!client?.phone) throw new Error('Add a mobile number on the client profile to share on WhatsApp.');
  const form = new FormData();
  form.append('file', blob, filename);
  const version = await api(`/api/designs/${designId}/versions`, { method: 'POST', form });
  if (!version?.pdfName) throw new Error('PDF could not be saved.');
  await shareProposalVersionOnWhatsApp({ pdfName: version.pdfName, proposalName, client });
  return version.pdfName;
}

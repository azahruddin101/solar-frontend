'use client';

// "Edit proposal" in a dialog, right where it was clicked: materials, charges, GST and subsidy for a 3D-designed
// proposal. It loads the design into the designer's store (and saves the same way the designer does), but shows only
// the pricing — no 3D scene, no layout tools.
import { Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { generatePdf } from '@/lib/pdf';
import { pricingFrom3D } from '@/lib/pricing';
import { useSession } from '@/lib/session';
import { useStore } from '@/lib/store';
import { useDesign } from '@/lib/useDesign';
import { useDesignSync } from '@/lib/useDesignSync';
import { useCatalog, useSolar } from '../App';
import { Alert, Button, LoadingBlock, Modal, toast } from '../kit';
import StepSimpleDesign from '../steps/StepSimpleDesign';

export default function ProposalEditModal({ designId, name, onClose }) {
  const company = useSession((s) => s.company);
  const state = useStore();
  const design = useDesign();
  const summary = useMemo(
    () => ({ address: state.place?.address || '', kwp: Number(design.totals.kwp.toFixed(3)), panels: design.totals.count, cost: Math.round(design.cost.total), annualKwh: Math.round(design.totals.acKwh), pricing: pricingFrom3D(design, state.config) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.place, design.totals.kwp, design.totals.count, design.totals.acKwh, design.cost, state.config],
  );
  const sync = useDesignSync(designId, summary);
  const loaded = sync.status === 'ready' && state.designId === designId;
  useSolar();
  useCatalog(loaded, company?.id);
  // keep a copy of the proposal as it stands, with its PDF (listed under the proposal's versions)
  const [savingVersion, setSavingVersion] = useState(false);
  const saveVersion = async () => {
    setSavingVersion(true);
    try {
      const { blob, filename } = await generatePdf({ design, project: state.project, place: state.place, finance: state.finance, snapshot: state.snapshot, company, client: state.client, designId, validUntil: state.validUntil, subsidy: state.subsidy, save: false });
      const form = new FormData();
      form.append('file', blob, filename);
      await api(`/api/designs/${designId}/versions`, { method: 'POST', form });
      toast.success('Version saved');
    } catch (e) {
      toast.error(e.message || 'Could not save the version');
    }
    setSavingVersion(false);
  };
  return (
    <Modal open onClose={onClose} size="2xl" title={name ? `Edit proposal · ${name}` : 'Edit proposal'}>
      {sync.status === 'error' ? <Alert>{sync.error || 'This proposal could not be loaded.'}</Alert> : !loaded ? <LoadingBlock /> : <StepSimpleDesign design={design} proposalOnly onDone={onClose} headerActions={!sync.readOnly && design.totals.count > 0 && <Button icon={Save} loading={savingVersion} onClick={saveVersion}>Save version</Button>} />}
    </Modal>
  );
}

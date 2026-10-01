'use client';

import { ArrowRight, FileText, Mail, MapPin, PenTool, Phone, User, Users, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { defaultValidUntil, toDateInput } from '@/lib/validity';
import { CLIENT_PROJECT_TYPES, CLIENT_ROOF_TYPES } from '@/lib/validation';
import { useSession } from '@/lib/session';
import { Badge, Button, FormField, Input, Modal, NumField, Select, Stepper, Toggle } from '../kit';

/** A quiet section label — separates a long form into clearly named parts without adding boxes/borders. */
function SectionLabel({ children, hint }) {
  return (
    <div className="flex items-baseline justify-between border-b border-slate-100 pb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{children}</span>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

/** A compact pill-style choice between a small number of options. */
function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div className={`grid gap-1 rounded-lg bg-slate-100 p-1 ${className || ''}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-md text-xs font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const DESIGN_STATUSES = [
  { id: 'draft', label: 'Draft', tone: 'slate' },
  { id: 'proposed', label: 'Proposed', tone: 'blue' },
  { id: 'won', label: 'Booked', tone: 'green' },
  { id: 'lost', label: 'Lost', tone: 'red' },
];

export function DesignStatusBadge({ status }) {
  const s = DESIGN_STATUSES.find((x) => x.id === status) || DESIGN_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

export const designHref = (d) => d.type === 'quick' ? `/proposal/${d.id}` : `/design/${d.id}/${d.summary?.panels ? 'plan' : 'location'}`;

export const PROJECT_TYPE_LABEL = { residential: 'Residential', industrial: 'Industrial', commercial: 'Commercial' };
export const ROOF_TYPE_LABEL = { concrete: 'Concrete', factory: 'Factory', tin_shed: 'Tin Shed' };

/** Pick the client (or arrive with one) and name the design, then open the designer. */
export function NewDesignModal({ clients = [], clientId, onClose }) {
  const router = useRouter();
  const formId = useId();
  const [client, setClient] = useState(clientId || clients[0]?.id || '');
  const [name, setName] = useState('');
  const [pricingMode, setPricingMode] = useState('package'); // 'package' | 'custom'
  const [packageId, setPackageId] = useState('');
  const [packagesList, setPackagesList] = useState([]);
  const [kind, setKind] = useState('3d'); // '3d' = with a 3D design, 'quick' = products/packages only
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  // Floor placement, financial outlook, tariff and installation charges all default here and stay
  // fully editable inside the proposal editor afterwards, so the creation form only asks what's essential.
  const companyTariff = useSession((s) => s.company?.tariff) || 8;
  const [billingName, setBillingName] = useState('');
  const [loanRequired, setLoanRequired] = useState(false);
  const [gridType, setGridType] = useState('on_grid');
  const [cleaningFrequency, setCleaningFrequency] = useState(0);
  const [cleaningCharge, setCleaningCharge] = useState(0);
  const [projectType, setProjectType] = useState('residential');
  const [roofType, setRoofType] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const steps = ['Proposal', 'Billing & Service'];
  const isLastStep = step === steps.length - 1;

  // Fetch available packages for company
  useEffect(() => {
    api('/api/packages')
      .then((data) => {
        if (Array.isArray(data)) {
          setPackagesList(data);
          if (data.length > 0) setPackageId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const selectedClient = useMemo(() => {
    return (clients || []).find((c) => c.id === client) || null;
  }, [clients, client]);

  useEffect(() => {
    if (!selectedClient) return;
    if (selectedClient.projectType) setProjectType(selectedClient.projectType);
    if (selectedClient.roofType) setRoofType(selectedClient.roofType);
  }, [selectedClient?.id]);

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!client) {
      setError('Please select a client to continue');
      return;
    }
    if (!isLastStep) {
      setError('');
      setStep((s) => s + 1);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const billingExtras = {
        billingName,
        loanRequired,
        gridType,
        cleaningFrequency: Number(cleaningFrequency) || 0,
        cleaningCharge: Number(cleaningCharge) || 0,
        projectType,
        roofType: roofType || '',
      };
      if (kind === 'quick') {
        const design = await api('/api/designs', { method: 'POST', body: { client, name, validUntil, type: 'quick', ...billingExtras } });
        router.push(`/proposal/${design.id}`);
        return;
      }
      const design = await api('/api/designs', {
        method: 'POST',
        body: {
          validUntil,
          outlookYears: 10,
          tariff: companyTariff,
          client,
          name,
          pricingMode,
          packageId: pricingMode === 'package' ? packageId : '',
          floorPlacement: 0,
          floorCost: 0,
          ...billingExtras,
        },
      });
      router.push(`/design/${design.id}/location`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };



  return (
    <Modal
      open
      size="2xl"
      onClose={onClose}
      title="New Proposal"
      description="The proposal PDF will be addressed to this client."
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" type="button" onClick={goBack} disabled={busy}>
              Back
            </Button>
          )}
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} disabled={step === 0 && !client}>
            {isLastStep ? (kind === 'quick' ? 'Create proposal' : 'Start proposal') : 'Next'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Stepper steps={steps} current={step} />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Panel: Form controls */}
          <form id={formId} onSubmit={submit} className="space-y-5 lg:col-span-2">
            {step === 0 && (
              <div className="space-y-5">
                <SegmentedControl
                  options={[{ value: '3d', label: 'With 3D design' }, { value: 'quick', label: 'Without 3D design' }]}
                  value={kind}
                  onChange={setKind}
                />
                {kind === 'quick' && <p className="-mt-3 text-[11px] text-slate-500">Pick packages/products, GST, floor and installation charges — no roof design needed.</p>}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Select client">
                    <Select required value={client} onValue={setClient} autoFocus>
                      <option value="">Choose a client...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>

                  <FormField label="Proposal Name" optional hint="Defaults to “Client name – rooftop solar”.">
                    <Input
                      value={name}
                      onValue={setName}
                      maxLength={120}
                      placeholder="e.g. Main building, 10 kW option"
                    />
                  </FormField>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Valid until" hint="The last day this proposal's price holds.">
                    <Input type="date" required min={toDateInput(new Date())} value={validUntil} onValue={setValidUntil} />
                  </FormField>
                  {kind === '3d' && (
                    <FormField label="Costing method" hint="How the price is worked out.">
                      <Select value={pricingMode} onValue={setPricingMode}>
                        <option value="package">Package</option>
                        <option value="custom">Custom</option>
                      </Select>
                    </FormField>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Project type">
                    <Select value={projectType} onValue={setProjectType}>
                      {CLIENT_PROJECT_TYPES.map((t) => (
                        <option key={t} value={t}>{PROJECT_TYPE_LABEL[t]}</option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label="Roof type" optional>
                    <Select value={roofType || ''} onValue={setRoofType}>
                      <option value="">Not specified</option>
                      {CLIENT_ROOF_TYPES.map((t) => (
                        <option key={t} value={t}>{ROOF_TYPE_LABEL[t]}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>

                {kind === '3d' && pricingMode === 'package' && (
                  <FormField label="Select Package">
                    <Select value={packageId} onValue={setPackageId}>
                      {!packagesList.length && <option value="">Standard Package (built-in)</option>}
                      {packagesList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.kw ? `(${p.kw} kW)` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
                {kind === '3d' && (
                  <p className="text-[11px] text-slate-400">Floor placement, tariff and installation charges can be set inside the proposal editor next.</p>
                )}
              </div>
            )}

            {/* Billing & service, the final step */}
            {isLastStep && (
              <div className="space-y-5">
                <SectionLabel hint="Optional">Billing &amp; service</SectionLabel>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Billing Name" optional hint="If different from the client's name.">
                    <Input value={billingName} onValue={setBillingName} maxLength={160} placeholder={selectedClient?.name || 'e.g. Business name for billing'} />
                  </FormField>
                  <FormField label="Grid Type">
                    <Select value={gridType} onValue={setGridType}>
                      <option value="on_grid">On Grid</option>
                      <option value="off_grid">Off Grid</option>
                    </Select>
                  </FormField>
                </div>

                <Toggle checked={loanRequired} onChange={setLoanRequired} label="Loan" description="Does this client need financing for the system?" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Roof cleaning / year" optional hint="Times per year">
                    <NumField min={0} max={365} step={1} value={cleaningFrequency} onValue={(v) => setCleaningFrequency(Math.round(v))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
                  </FormField>
                  <FormField label="Charge per cleaning" optional>
                    <NumField min={0} step="any" value={cleaningCharge} onValue={setCleaningCharge} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
                  </FormField>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>


        {/* Right Panel: Selected client info OR Instructions */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
          {selectedClient ? (
            <div className="space-y-4 animate-fade">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Client details</span>
                  <h4 className="text-base font-bold text-slate-900">{selectedClient.name}</h4>
                  {selectedClient.source && (
                    <span className="inline-block text-xs text-slate-500 font-medium">
                      Source: {selectedClient.source}
                    </span>
                  )}
                </div>
                {selectedClient.kwRequired ? (
                  <Badge tone="brand">
                    <Zap className="h-3 w-3" /> {selectedClient.kwRequired} kW
                  </Badge>
                ) : null}
              </div>

              <div className="space-y-2.5 text-xs text-slate-600">
                <div>
                  <span className="font-medium text-slate-400 block">Consumer / Meter number</span>
                  <span className="font-mono text-slate-800 text-[13px]">
                    {selectedClient.consumerNumber || '—'}
                  </span>
                </div>

                <div>
                  <span className="font-medium text-slate-400 block">Required Solar Capacity</span>
                  <span className="text-slate-800 text-[13px] font-medium">
                    {selectedClient.kwRequired ? `${selectedClient.kwRequired} kW` : '—'}
                  </span>
                </div>

                <div className="flex gap-4">
                  <div>
                    <span className="font-medium text-slate-400 block">Project type (this proposal)</span>
                    <span className="text-slate-800 text-[13px] font-medium">{PROJECT_TYPE_LABEL[projectType] || '—'}</span>
                  </div>
                  <div>
                    <span className="font-medium text-slate-400 block">Roof type (this proposal)</span>
                    <span className="text-slate-800 text-[13px] font-medium">{ROOF_TYPE_LABEL[roofType] || '—'}</span>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-slate-400 block">Contact</span>
                  <div className="text-slate-800 text-[13px]">
                    {selectedClient.phone && <div>{selectedClient.phone}</div>}
                    {selectedClient.email && <div className="text-slate-500">{selectedClient.email}</div>}
                    {!selectedClient.phone && !selectedClient.email && '—'}
                  </div>
                </div>

                <div>
                  <span className="font-medium text-slate-400 block">Address</span>
                  <p className="text-slate-800 leading-relaxed text-[13px]">
                    {selectedClient.address || '—'}
                  </p>
                </div>

                {selectedClient.documents?.length > 0 && (
                  <div className="pt-1">
                    <span className="font-medium text-slate-400 block mb-1">Attached Documents</span>
                    <div className="flex items-center gap-1.5 text-xs text-brand font-medium">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{selectedClient.documents.length} document{selectedClient.documents.length > 1 ? 's' : ''} available on client profile</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center animate-fade">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-xs text-slate-400">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-semibold text-slate-800">Select a client</h4>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed max-w-[220px]">
                Choose a client from the left to view their consumer meter number, electricity load, address and contact details before starting the proposal.
              </p>
            </div>
          )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { ArrowRight, FileText, Mail, MapPin, PenTool, Phone, User, Users, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';

import { api } from '@/lib/api';
import { Badge, Button, FormField, Input, Modal, Select } from '../kit';

export const DESIGN_STATUSES = [
  { id: 'draft', label: 'Draft', tone: 'slate' },
  { id: 'proposed', label: 'Proposed', tone: 'blue' },
  { id: 'won', label: 'Won', tone: 'green' },
  { id: 'lost', label: 'Lost', tone: 'red' },
];

export function DesignStatusBadge({ status }) {
  const s = DESIGN_STATUSES.find((x) => x.id === status) || DESIGN_STATUSES[0];
  return <Badge dot tone={s.tone}>{s.label}</Badge>;
}

export const designHref = (d) => `/design/${d.id}/${d.summary?.panels ? 'plan' : 'location'}`;

/** Pick the client (or arrive with one) and name the design, then open the designer. */
export function NewDesignModal({ clients = [], clientId, onClose }) {
  const router = useRouter();
  const formId = useId();
  const [client, setClient] = useState(clientId || clients[0]?.id || '');
  const [name, setName] = useState('');
  const [pricingMode, setPricingMode] = useState('package'); // 'package' | 'custom'
  const [packageId, setPackageId] = useState('');
  const [packagesList, setPackagesList] = useState([]);
  const [floorPlacement, setFloorPlacement] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!client) {
      setError('Please select a client to start designing');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const design = await api('/api/designs', {
        method: 'POST',
        body: {
          client,
          name,
          pricingMode,
          packageId: pricingMode === 'package' ? packageId : '',
          floorPlacement: Number(floorPlacement) || 0,
          floorCost: Number(floorPlacement) > 0 ? Number(floorPlacement) * 5000 : 0,
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
      size="lg"
      onClose={onClose}
      title="New design"
      description="The proposal PDF will be addressed to this client."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy} disabled={!client}>
            Start designing
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Panel: Form controls */}
        <form id={formId} onSubmit={submit} className="space-y-4">
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

          <FormField label="Design name" optional hint="Defaults to “Client name – rooftop solar”.">
            <Input
              value={name}
              onValue={setName}
              maxLength={120}
              placeholder="e.g. Main building, 10 kW option"
            />
          </FormField>

          {/* Pricing mode selection: [(Package) (Custom)] */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1.5">
              Design Pricing Mode
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200/80 p-1">
              {[
                ['package', 'Package'],
                ['custom', 'Custom'],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPricingMode(mode)}
                  className={`h-8 rounded-md text-xs font-semibold transition ${
                    pricingMode === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {pricingMode === 'package' && (
              <div className="mt-2.5">
                <label className="text-xs font-medium text-slate-700 block mb-1">Select Package</label>
                <Select
                  value={packageId}
                  onValue={setPackageId}
                >
                  {!packagesList.length && <option value="">Standard Package (built-in)</option>}
                  {packagesList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.kw ? `(${p.kw} kW)` : ''}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-[11px] text-slate-500">
                  Individual product prices are hidden with - in proposal PDF.
                </p>
              </div>
            )}
          </div>

          {/* Floor placement */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-1">
              Floor Placement
            </label>
            <Select
              value={String(floorPlacement)}
              onValue={(v) => setFloorPlacement(Number(v))}
            >
              <option value="0">Ground Level (₹0)</option>
              <option value="1">1st Floor (+₹5,000)</option>
              <option value="2">2nd Floor (+₹10,000)</option>
              <option value="3">3rd Floor (+₹15,000)</option>
              <option value="4">4th Floor (+₹20,000)</option>
              <option value="5">5th Floor+ (+₹25,000)</option>
            </Select>
            <p className="mt-1 text-[11px] text-slate-500">
              Can also be customized or changed inside the design editor.
            </p>
          </div>

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
                Choose a client from the left to view their consumer meter number, electricity load, address and contact details before starting the design.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

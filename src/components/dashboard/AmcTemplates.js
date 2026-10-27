'use client';

// Company-wide AMC schedule. Mandatory AMCs are scheduled on every job and you assign the staff; optional ones are
// requested by the client (or added by you on a proposal). Free or paid is just the price.
import { ArrowDown, ArrowUp, CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/energy';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { useSession } from '@/lib/session';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  FormModal,
  IconButton,
  Input,
  LoadingBlock,
  PageHeader,
  RowMenu,
  Select,
  RichTextContent,
  RichTextEditor,
  Table,
  Td,
  Textarea,
  Th,
  Tr,
  showError,
  toast,
} from '../kit';
import { richTextIsEmpty } from '@/lib/pdfRichText';
import { sanitizeRichHtml, toRichHtml } from '@/lib/richText';

const MAX = 20;
let seq = 0;

function newRow(partial = {}) {
  return {
    key: partial.key || `new-${++seq}`,
    name: partial.name ?? '',
    daysAfterInstallation: String(partial.daysAfterInstallation ?? '60'),
    kind: partial.kind === 'optional' ? 'optional' : 'mandatory',
    price: String(partial.price ?? 0),
    description: partial.description ?? '',
    criteriaText: partial.criteriaText ?? '',
  };
}

function criteriaFromText(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function criteriaToText(list) {
  return (list || []).map((c) => (typeof c === 'string' ? c : c.label || '')).filter(Boolean).join('\n');
}

function daysSortKey(days) {
  if (days === '' || days == null) return Number.MAX_SAFE_INTEGER;
  const n = Number(days);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

function rowsFromApi(list) {
  return (list || []).map((t) => newRow({
    key: t.id,
    name: t.name,
    daysAfterInstallation: t.daysAfterInstallation != null ? String(t.daysAfterInstallation) : '',
    kind: t.kind,
    price: t.price,
    description: t.description,
    criteriaText: criteriaToText(t.criteria),
  }));
}

function descriptionPreview(html) {
  if (richTextIsEmpty(html)) return '';
  return sanitizeRichHtml(toRichHtml(html)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function rowsToApi(rows) {
  return rows.map((r) => {
    const kind = r.kind === 'optional' ? 'optional' : 'mandatory';
    const rawDays = String(r.daysAfterInstallation ?? '').trim();
    let daysAfterInstallation = null;
    if (kind === 'mandatory' && rawDays !== '') {
      const n = Number(rawDays);
      if (Number.isFinite(n) && n >= 1) daysAfterInstallation = n;
    }
    if (kind === 'mandatory' && daysAfterInstallation == null) {
      throw new Error('Due days are required for mandatory visits');
    }
    return {
    name: r.name.trim(),
    daysAfterInstallation,
    kind,
    price: Number(r.price) || 0,
    description: r.description || '',
    criteria: criteriaFromText(r.criteriaText),
  };
  });
}

function VisitFormModal({ visit, isNew, onClose, onSaved, currency }) {
  const [form, setForm] = useState(() => visit || newRow({ name: 'AMC1' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    if (!form.name.trim()) return setError('Enter a visit name');
    const rawDays = String(form.daysAfterInstallation ?? '').trim();
    if (form.kind === 'mandatory') {
      const days = Number(rawDays);
      if (!Number.isFinite(days) || days < 1 || days > 3650) return setError('Enter when it is due, in days after installation (1–3650)');
    }
    setBusy(true);
    setError('');
    try {
      await onSaved({ ...form, name: form.name.trim() });
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <FormModal
      open
      size="7xl"
      onClose={onClose}
      title={isNew ? 'Add maintenance visit' : 'Edit maintenance visit'}
      submitLabel={isNew ? 'Add visit' : 'Save visit'}
      busy={busy}
      error={error}
      onSubmit={submit}
      noValidate
      scrollBody={false}
      bodyClassName="flex min-h-0 flex-1 flex-col py-4"
      panelClassName="min-h-[min(44rem,90dvh)]"
    >
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-stretch lg:gap-6">
        <div className="flex h-full min-h-0 flex-col gap-3">
          <FormField label="Visit name">
            <Input maxLength={80} value={form.name} onValue={(v) => set({ name: v })} placeholder="e.g. AMC1" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Type" hint={form.kind === 'mandatory' ? 'Scheduled on every job; you assign the staff' : 'The client requests it, or you add it to a proposal'}>
              <Select value={form.kind} onValue={(v) => set({ kind: v })}>
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
              </Select>
            </FormField>
            <FormField label={`Price (${currency})`} hint={Number(form.price) > 0 ? 'Paid' : 'Free (0)'}>
              <Input type="number" min={0} step="0.01" value={form.price} onValue={(v) => set({ price: v })} placeholder="0" />
            </FormField>
            {form.kind === 'mandatory' && (
              <FormField label="Due (days)" hint="After the installation is done">
                <Input type="number" min={1} max={3650} value={form.daysAfterInstallation} onValue={(v) => set({ daysAfterInstallation: v })} placeholder="60" />
              </FormField>
            )}
          </div>
          <FormField label="Description" optional className="flex min-h-0 flex-1 flex-col [&>span:first-child]:shrink-0">
            <RichTextEditor
              key={form.key}
              aria-label="Visit description"
              value={form.description}
              onChange={(v) => set({ description: v })}
              placeholder="Client-facing summary…"
              maxLength={6000}
              minHeight={120}
              className="amc-desc-editor amc-desc-editor--stretch min-h-0 flex-1"
            />
          </FormField>
        </div>

        <div className="flex h-full min-h-0 flex-col border-t border-slate-200 pt-4 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <FormField label="Services" hint="One per line" className="flex h-full min-h-0 flex-1 flex-col [&>span:first-child]:shrink-0">
            <Textarea
              rows={1}
              maxLength={8200}
              value={form.criteriaText}
              onValue={(v) => set({ criteriaText: v })}
              placeholder={'Panel cleaning\nInverter log review\nEarthing check'}
              className="min-h-0 flex-1 resize-none font-mono text-[13px] leading-snug"
            />
          </FormField>
        </div>
      </div>
    </FormModal>
  );
}

export default function AmcTemplates() {
  const currency = useSession((s) => s.company?.currency) || 'INR';
  const saved = useResource('/api/projects/amc-templates');
  const [rows, setRows] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const money = (v) => formatMoney(v, currency, { decimals: Number(v) % 1 ? 2 : 0 });
  const priceLabel = (v) => (Number(v) > 0 ? money(v) : 'Free');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved.data && rows === null) setRows(rowsFromApi(saved.data));
  }, [saved.data, rows]);

  const sorted = useMemo(
    () => (rows ? [...rows].sort((a, b) => daysSortKey(a.daysAfterInstallation) - daysSortKey(b.daysAfterInstallation)) : []),
    [rows],
  );

  const stats = useMemo(() => {
    if (!rows?.length) return { total: 0, mandatory: 0, optional: 0 };
    return {
      total: rows.length,
      mandatory: rows.filter((r) => r.kind !== 'optional').length,
      optional: rows.filter((r) => r.kind === 'optional').length,
    };
  }, [rows]);

  const closeModal = () => { setModal(null); setModalError(''); };
  const closeConfirm = () => { setConfirm(null); setModalError(''); };

  const persist = async (nextRows) => {
    setBusy(true);
    try {
      const body = await api('/api/projects/amc-templates', { method: 'PUT', body: { templates: rowsToApi(nextRows) } });
      setRows(rowsFromApi(body));
      return body;
    } catch (err) {
      showError(err, 'The AMC schedule was not saved');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const upsertVisit = async (visit) => {
    const exists = rows.some((r) => r.key === visit.key);
    const next = exists ? rows.map((r) => (r.key === visit.key ? visit : r)) : [...rows, visit];
    if (next.length > MAX) {
      toast.error(`You can have up to ${MAX} visits`);
      return;
    }
    await persist(next);
    toast.success(exists ? 'Visit updated' : 'Visit added');
    closeModal();
  };

  const removeVisit = async () => {
    const key = confirm?.key;
    if (!key) return;
    setBusy(true);
    setModalError('');
    try {
      await persist(rows.filter((r) => r.key !== key));
      toast.success('Visit removed');
      closeConfirm();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  const moveVisit = async (key, dir) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    next.splice(j, 0, next.splice(i, 1)[0]);
    await persist(next);
  };

  const loadExample = async () => {
    const example = [
      newRow({ name: 'AMC1', daysAfterInstallation: '60', criteriaText: 'Panel cleaning\nWiring check' }),
      newRow({ name: 'Extra health check', daysAfterInstallation: '', kind: 'optional', price: '1500', criteriaText: 'Full system health check\nInverter log review' }),
    ];
    await persist(example);
    toast.success('Example schedule added');
  };

  const openAdd = () => {
    const n = (rows?.length || 0) + 1;
    setModal({ isNew: true, visit: newRow({ name: `AMC${n}` }) });
  };

  return (
    <>
      <PageHeader
        title="AMC schedule"
        description="Mandatory AMCs are scheduled on every job after installation — you assign the staff. Optional AMCs are requested by the client from their portal, or you add one to a proposal from the AMC tracker. Staff mark each visit completed. Free or paid is just the price."
      >
        <Button variant="primary" icon={Plus} disabled={busy || rows === null || rows.length >= MAX} onClick={openAdd}>
          Add visit
        </Button>
      </PageHeader>

      {saved.error && <Alert className="mb-6">{saved.error}</Alert>}

      {rows && rows.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            ['Total visits', stats.total],
            ['Mandatory (included)', stats.mandatory],
            ['Optional (on request)', stats.optional],
          ].map(([label, value]) => (
            <Card key={label} className="px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
            </Card>
          ))}
        </div>
      )}

      {sorted.length > 1 && (
        <Card className="mb-5 px-4 py-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Timeline (after installation)</div>
          <ol className="mt-3 flex flex-wrap items-center gap-2">
            {sorted.filter((r) => r.kind !== 'optional' && String(r.daysAfterInstallation ?? '').trim() !== '').map((r, i) => (
              <li key={r.key} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-300" aria-hidden>→</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800 ring-1 ring-slate-200 ring-inset">
                  <span className="text-slate-500">{r.daysAfterInstallation}d</span>
                  <span>{r.name}</span>
                </span>
              </li>
            ))}
            {sorted.some((r) => r.kind === 'optional') && (
              <li className="text-xs text-slate-500">Optional AMCs are dated when they are requested.</li>
            )}
          </ol>
          <p className="mt-2 text-xs text-slate-500">Visits are stored in date order when saved. Existing installations keep visits already created.</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows === null ? (
          <LoadingBlock />
        ) : !rows.length ? (
          <EmptyState
            icon={CalendarClock}
            title="No maintenance visits yet"
            description="Add your first visit (for example AMC1 at 60 days) with a checklist your field team can complete on site."
          >
            <Button variant="primary" icon={Plus} onClick={openAdd}>Add first visit</Button>
            <Button variant="secondary" onClick={loadExample} disabled={busy}>Load example schedule</Button>
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10"> </Th>
                <Th>Visit</Th>
                <Th>Type</Th>
                <Th className="text-right">Price</Th>
                <Th className="text-right">Due</Th>
                <Th>Services</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const criteriaCount = criteriaFromText(r.criteriaText).length;
                return (
                  <Tr key={r.key}>
                    <Td className="text-center text-xs font-medium text-slate-400 tabular-nums">{i + 1}</Td>
                    <Td>
                      <div className="font-medium text-slate-900">{r.name}</div>
                      {descriptionPreview(r.description) && (
                        <div className="mt-0.5 max-w-md truncate text-xs text-slate-500">{descriptionPreview(r.description)}</div>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={r.kind === 'optional' ? 'brand' : 'slate'}>
                        {r.kind === 'optional' ? 'Optional' : 'Mandatory'}
                      </Badge>
                      <Badge tone={Number(r.price) > 0 ? 'amber' : 'green'} className="ml-1.5">
                        {Number(r.price) > 0 ? 'Paid' : 'Free'}
                      </Badge>
                    </Td>
                    <Td className="text-right tabular-nums text-slate-800">{priceLabel(r.price)}</Td>
                    <Td className="text-right whitespace-nowrap tabular-nums text-slate-700">
                      {r.kind !== 'optional' && String(r.daysAfterInstallation ?? '').trim() !== '' ? (
                        <>{r.daysAfterInstallation} <span className="text-slate-400">days</span></>
                      ) : (
                        <span className="text-slate-400">On request</span>
                      )}
                    </Td>
                    <Td className="text-slate-600">
                      {criteriaCount ? `${criteriaCount} item${criteriaCount === 1 ? '' : 's'}` : <span className="text-slate-400">None</span>}
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconButton
                          icon={ArrowUp}
                          label="Move up"
                          disabled={busy || rows.findIndex((x) => x.key === r.key) === 0}
                          className="disabled:opacity-30"
                          onClick={() => moveVisit(r.key, -1)}
                        />
                        <IconButton
                          icon={ArrowDown}
                          label="Move down"
                          disabled={busy || rows.findIndex((x) => x.key === r.key) === rows.length - 1}
                          className="disabled:opacity-30"
                          onClick={() => moveVisit(r.key, 1)}
                        />
                        <RowMenu
                          label={`Actions for ${r.name}`}
                          items={[
                            { key: 'edit', icon: Pencil, label: 'Edit visit', onClick: () => setModal({ isNew: false, visit: { ...r } }) },
                            { key: 'delete', icon: Trash2, label: 'Remove visit', tone: 'danger', onClick: () => setConfirm({ key: r.key, name: r.name }) },
                          ]}
                        />
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {modal && (
        <VisitFormModal
          visit={modal.visit}
          isNew={modal.isNew}
          currency={currency}
          onClose={closeModal}
          onSaved={upsertVisit}
        />
      )}

      <ConfirmDialog open={Boolean(confirm)} onClose={closeConfirm} onConfirm={removeVisit} title="Remove this visit?" busy={busy} error={modalError}>
        “{confirm?.name}” will be removed from the schedule. Installations that already have this visit are not changed.
      </ConfirmDialog>
    </>
  );
}

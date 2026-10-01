'use client';

// One installation: its steps (who does what, how far along) and the activity log.
// The company owner (`mode="owner"`) manages every step; an agent (`mode="agent"`) works on their own.
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleCheck, Download, MapPin, MessageSquare, Pencil, Phone, Play, Plus, RotateCcw, Trash2, User, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { agentRolesFor, agentRolesLabel, agentsForStepRole } from '@/lib/agents';
import { api, assetUrl } from '@/lib/api';
import { importLibrary, MAPS_API_KEY } from '@/lib/googleMaps';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { useSignedUrl } from '@/lib/files';
import { DEFAULT_STEP_PRIORITY, STEP_PRIORITIES, stepColor } from '@/lib/steps';
import { stepCreateSchema, useValidation } from '@/lib/validation';
import { Alert, Avatar, Badge, Button, Card, CardHeader, ConfirmDialog, FormField, FormModal, IconButton, ImageSourceButtons, Input, LoadingBlock, PageHeader, Select, Textarea, ZoomImage, cx, showError, toast } from '../kit';
import { generateLifecyclePdf } from '@/lib/lifecyclePdf';
import { describeLifecycleEvent } from '@/lib/lifecycleLog';
import { Progress, ProjectStatusBadge, StepPriorityBadge, StepStatusBadge, formatDateTime } from './shared';

/** A photo attached to an activity-log entry (protected: opened through a signed link). */
function StepPhoto({ url }) {
  const src = useSignedUrl(url);
  return src
    ? <ZoomImage src={src} alt="Step photo" className="mt-2 max-h-28 rounded-md border border-slate-200 object-cover" />
    : <span className="mt-2 block h-20 w-28 animate-pulse rounded-md bg-slate-200/70" aria-label="Loading photo" />;
}

const addressCache = new Map(); // "lat,lng" (5dp) → resolved address, shared across every entry on the page
let geocoder = null;

/** Where a GPS point logged on an activity-log entry actually is — falls back to the coordinates while resolving or if reverse geocoding fails. */
function GeoLabel({ lat, lng }) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const [address, setAddress] = useState(addressCache.get(key) || '');
  useEffect(() => {
    if (!MAPS_API_KEY || addressCache.has(key)) return;
    let dead = false;
    (geocoder ? Promise.resolve(geocoder) : importLibrary('geocoding').then(({ Geocoder }) => (geocoder = new Geocoder())))
      .then((g) => g.geocode({ location: { lat, lng } }))
      .then((res) => {
        const formatted = res.results?.[0]?.formatted_address || '';
        addressCache.set(key, formatted);
        if (!dead) setAddress(formatted);
      })
      .catch(() => {});
    return () => (dead = true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <p className="mt-1 text-xs text-slate-500">
      <MapPin className="mr-1 inline h-3.5 w-3.5" />
      {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
    </p>
  );
}

function StepForm({ step, agents, roleOptions, onClose, onSubmit }) {
  const [form, setForm] = useState({
    name: step?.name || '',
    description: step?.description || '',
    role: step?.role || '',
    assignee: step?.assignee?.id || '',
    priority: step?.priority || DEFAULT_STEP_PRIORITY,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const v = useValidation(stepCreateSchema, form);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const eligible = agentsForStepRole(agents, form.role);
  const setRole = (role) => {
    setForm((f) => {
      const next = { ...f, role };
      if (f.assignee && !agentsForStepRole(agents, role).some((a) => a.id === f.assignee)) next.assignee = '';
      return next;
    });
  };
  const submit = async () => {
    const data = v.validate();
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ ...data, role: data.role || null, assignee: data.assignee || null });
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="sm" title={step ? 'Edit step' : 'Add a step'} description="Only this installation changes — your step template stays as it is." submitLabel={step ? 'Save changes' : 'Add step'} busy={busy} error={error} onSubmit={submit} noValidate>
      <FormField label="Step name" error={v.error('name')}><Input maxLength={80} value={form.name} onValue={(x) => set({ name: x })} placeholder="e.g. Net-meter application" /></FormField>
      <FormField label="What needs doing" optional error={v.error('description')}><Textarea rows={2} maxLength={400} value={form.description} onValue={(x) => set({ description: x })} /></FormField>
      <FormField label="Priority" hint="Medium unless you choose otherwise.">
        <Select value={form.priority} onValue={(x) => set({ priority: x })}>
          {STEP_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
      </FormField>
      <FormField label="Role" optional hint="Only agents with this role can be assigned.">
        <Select value={form.role} onValue={setRole}>
          <option value="">Any role</option>
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </FormField>
      <FormField label="Assigned to" optional>
        <Select value={form.assignee} onValue={(v) => set({ assignee: v })}>
          <option value="">Unassigned</option>
          {step?.assignee && !step.assignee.active && !eligible.some((a) => a.id === step.assignee.id) && (
            <option value={step.assignee.id}>{step.assignee.name} (inactive)</option>
          )}
          {eligible.map((a) => <option key={a.id} value={a.id}>{a.name}{agentRolesLabel(a) ? ` · ${agentRolesLabel(a)}` : ''}</option>)}
        </Select>
      </FormField>
    </FormModal>
  );
}

/** Optional note; when marking done, location is required and a photo is optional. */
function StatusModal({ step, status, onClose, onSubmit }) {
  const completing = status === 'done';
  const [note, setNote] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = status === 'done' ? 'Mark step as done' : status === 'in_progress' ? (step.status === 'done' ? 'Reopen step' : 'Start step') : 'Move step back to pending';

  useEffect(() => {
    if (!completing || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(String(Number(p.coords.latitude.toFixed(6))));
        setLng(String(Number(p.coords.longitude.toFixed(6))));
        setLocating(false);
      },
      () => {
        setLocError('Could not read GPS — enter latitude and longitude manually.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [completing]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const pickPhoto = (file) => {
    if (!file) return;
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const submit = async () => {
    if (completing) {
      const la = Number(lat);
      const ln = Number(lng);
      if (!Number.isFinite(la) || la < -90 || la > 90) {
        setError('Enter a valid latitude (-90 to 90).');
        return;
      }
      if (!Number.isFinite(ln) || ln < -180 || ln > 180) {
        setError('Enter a valid longitude (-180 to 180).');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(completing ? { note, lat: Number(lat), lng: Number(lng), photo } : note);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size={completing ? 'md' : 'sm'} title={title} description={step.name} submitLabel="Confirm" busy={busy} error={error} onSubmit={submit}>
      {completing && (
        <>
          <FormField label="Current location" hint="Required — saved with this completion.">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Latitude" required type="number" step="any" min={-90} max={90} value={lat} onValue={setLat} placeholder="Latitude" />
              <Input aria-label="Longitude" required type="number" step="any" min={-180} max={180} value={lng} onValue={setLng} placeholder="Longitude" />
            </div>
            {locating && <p className="mt-1.5 text-xs text-slate-500">Reading GPS…</p>}
            {locError && <p className="mt-1.5 text-xs text-amber-700">{locError}</p>}
          </FormField>
          <FormField label="Photo" optional hint="Optional site photo for the activity log.">
            <div className="flex flex-wrap items-center gap-2">
              <ImageSourceButtons onFiles={pickPhoto} />
              {photo && <Button type="button" size="sm" variant="ghost" onClick={() => { setPhoto(null); setPhotoPreview((p) => { if (p) URL.revokeObjectURL(p); return ''; }); }}>Remove</Button>}
            </div>
            {photoPreview && <ZoomImage src={photoPreview} alt="Selected photo" className="mt-2 max-h-36 rounded-lg border border-slate-200 object-cover" />}
          </FormField>
        </>
      )}
      <FormField label="Note" optional hint="Saved in the activity log."><Textarea rows={3} maxLength={1000} value={note} onValue={setNote} placeholder={status === 'done' ? 'e.g. Roof measured, no shading issues.' : ''} /></FormField>
    </FormModal>
  );
}

function StepMarker({ index, status }) {
  if (status === 'done') return <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>;
  return <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold', status === 'in_progress' ? 'bg-brand text-brand-fg' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200 ring-inset')}>{index + 1}</span>;
}

export default function ProjectView({ id, mode, basePath = '/dashboard/installations' }) {
  const owner = mode === 'owner';
  const base = owner ? '/api/projects' : '/api/my/projects';
  const back = owner ? basePath : '/agent';
  const router = useRouter();
  const company = useSession((s) => s.company);
  const me = useSession((s) => s.user);
  const { data: project, setData, loading, error } = useResource(`${base}/${id}`);
  const lifecycle = useResource(`${base}/${id}/lifecycle`);
  const agents = useResource(owner ? '/api/agents' : null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [note, setNote] = useState({ step: '', message: '' });
  const [noting, setNoting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const close = () => { setModal(null); setModalError(''); };
  /** Every change returns the whole project (steps + log). */
  const send = async (path, options) => {
    setData(await api(`${base}/${id}${path}`, options));
    lifecycle.reload();
  };
  const downloadLifecyclePdf = async () => {
    setPdfBusy(true);
    try {
      const data = lifecycle.data || await api(`${base}/${id}/lifecycle`);
      await generateLifecyclePdf({ lifecycle: data, company, client: data.client });
    } catch (e) {
      showError(e, 'Could not create PDF');
    }
    setPdfBusy(false);
  };
  const quick = async (path, options) => {
    try {
      await send(path, options);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const confirm = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      done?.();
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };
  const addNote = async (e) => {
    e.preventDefault();
    setNoting(true);
    try {
      await send('/notes', { method: 'POST', body: { step: note.step || undefined, message: note.message } });
      setNote({ step: note.step, message: '' });
    } catch (err) {
      showError(err, 'The note was not added');
    }
    setNoting(false);
  };

  if (loading) return <LoadingBlock />;
  if (!project) return <><Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</Link><Alert>{error || 'Installation not found'}</Alert></>;

  const activeAgents = (agents.data || []).filter((a) => a.active);
  const roleOptions = agentRolesFor(company);
  const { design, client, steps } = project;
  const timeline = lifecycle.data?.events || [];

  return (
    <>
      <Link href={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> {owner ? 'All installations' : 'My tasks'}</Link>
      <PageHeader title={design?.name || 'Installation'} description={<span className="flex flex-wrap items-center gap-x-4 gap-y-1"><ProjectStatusBadge status={project.status} /><span>Started {formatDateTime(project.createdAt)}</span></span>}>
        {owner && design && <Link href={`/design/${design.id}/plan`} className="text-sm font-medium text-brand hover:underline">Open proposal</Link>}
        {owner && <Button variant="dangerGhost" icon={Trash2} onClick={() => setModal({ type: 'delete' })}>Delete</Button>}
      </PageHeader>

      <Card className="mb-6 grid gap-x-8 gap-y-3 px-6 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><div className="text-xs text-slate-500">Client</div><div className="truncate font-medium text-slate-900">{client?.name || '—'}</div></div></div>
        <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><div className="text-xs text-slate-500">Phone</div>{client?.phone ? <a href={`tel:${client.phone}`} className="font-medium text-brand hover:underline">{client.phone}</a> : <div className="text-slate-400">—</div>}</div></div>
        <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><div className="text-xs text-slate-500">Site</div><div className="line-clamp-2 text-slate-900">{design?.summary?.address || client?.address || '—'}</div></div></div>
        <div className="flex items-start gap-2"><Zap className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><div className="text-xs text-slate-500">System</div><div className="font-medium text-slate-900 tabular-nums">{design?.summary?.kwp ? `${design.summary.kwp.toFixed(2)} kWp · ${design.summary.panels} panels` : '—'}</div></div></div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Steps" description={<Progress project={project} className="mt-1.5 w-56" />} action={owner && <Button size="sm" icon={Plus} onClick={() => setModal({ type: 'step' })}>Add step</Button>} />
          <ol>
            {steps.map((s, i) => {
              const mine = owner || s.assignee?.id === me.id;
              const eligibleAgents = agentsForStepRole(activeAgents, s.role);
              return (
                <li key={s.id} style={{ borderLeftColor: stepColor(s) }} className={cx('flex gap-4 border-b border-l-4 border-slate-100 px-6 py-4 last:border-b-0', !owner && s.assignee?.id === me.id && s.status !== 'done' && 'bg-brand-soft/50')}>
                  <StepMarker index={i} status={s.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={cx('font-medium', s.status === 'done' ? 'text-slate-500' : 'text-slate-900')}>{s.name}</span>
                      <StepStatusBadge status={s.status} />
                      <StepPriorityBadge step={s} />
                      {s.role && <Badge tone="slate">{s.role}</Badge>}
                      {!owner && s.assignee?.id === me.id && <Badge tone="brand">Yours</Badge>}
                    </div>
                    {s.description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{s.description}</p>}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
                      {owner ? (
                        <Select aria-label={`Assign ${s.name}`} value={s.assignee?.id || ''} onValue={(v) => quick(`/steps/${s.id}`, { method: 'PUT', body: { assignee: v || null } })} className="h-8 min-w-[12rem] max-w-full text-[13px]">
                          <option value="">{s.role ? `Unassigned (${s.role})` : 'Unassigned'}</option>
                          {s.assignee && !s.assignee.active && !eligibleAgents.some((a) => a.id === s.assignee.id) && (
                            <option value={s.assignee.id}>{s.assignee.name} (inactive)</option>
                          )}
                          {eligibleAgents.map((a) => <option key={a.id} value={a.id}>{a.name}{agentRolesLabel(a) ? ` · ${agentRolesLabel(a)}` : ''}</option>)}
                        </Select>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">{s.assignee ? <><Avatar name={s.assignee.name} src={s.assignee.photo ? assetUrl(s.assignee.photo) : undefined} size={20} /> {s.assignee.name}</> : 'Unassigned'}</span>
                      )}
                      {s.completedAt ? <span>Done {formatDateTime(s.completedAt)}</span> : s.startedAt && <span>Started {formatDateTime(s.startedAt)}</span>}
                    </div>
                    {mine && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {s.status === 'pending' && <Button size="sm" icon={Play} onClick={() => setModal({ type: 'status', step: s, status: 'in_progress' })}>Start</Button>}
                        {s.status !== 'done' && <Button size="sm" variant="primary" icon={CircleCheck} onClick={() => setModal({ type: 'status', step: s, status: 'done' })}>Mark done</Button>}
                        {s.status === 'done' && <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setModal({ type: 'status', step: s, status: 'in_progress' })}>Reopen</Button>}
                      </div>
                    )}
                  </div>
                  {owner && (
                    <div className="flex shrink-0 items-start">
                      <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => quick(`/steps/${s.id}`, { method: 'PUT', body: { move: 'up' } })} />
                      <IconButton icon={ArrowDown} label="Move down" disabled={i === steps.length - 1} className="disabled:opacity-30" onClick={() => quick(`/steps/${s.id}`, { method: 'PUT', body: { move: 'down' } })} />
                      <IconButton icon={Pencil} label="Edit step" onClick={() => setModal({ type: 'step', step: s })} />
                      <IconButton icon={Trash2} label="Remove step" tone="danger" disabled={steps.length === 1} className="disabled:opacity-30" onClick={() => setModal({ type: 'removeStep', step: s })} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Project history"
            description="Client, proposal, status changes, and installation — oldest first."
            action={<Button size="sm" icon={Download} loading={pdfBusy} disabled={lifecycle.loading} onClick={downloadLifecyclePdf}>Download PDF</Button>}
          />
          <form onSubmit={addNote} className="space-y-2 border-b border-slate-100 px-6 py-4">
            <Textarea aria-label="Note" rows={2} maxLength={1000} required value={note.message} onValue={(v) => setNote((n) => ({ ...n, message: v }))} placeholder="Add a note for the team…" />
            <div className="flex gap-2">
              <Select aria-label="About step" value={note.step} onValue={(v) => setNote((n) => ({ ...n, step: v }))} className="h-8 min-w-0 flex-1 text-[13px]">
                <option value="">Whole installation</option>
                {steps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Button type="submit" size="sm" icon={MessageSquare} loading={noting}>Add note</Button>
            </div>
          </form>
          {lifecycle.loading && !timeline.length ? <LoadingBlock /> : (
            <ul className="max-h-[560px] overflow-y-auto px-6 py-2">
              {timeline.map((l) => {
                const d = describeLifecycleEvent(l);
                return (
                  <li key={l.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', l.action.includes('completed') ? 'bg-emerald-500' : l.action === 'note' ? 'bg-amber-400' : l.phase === 'client' ? 'bg-violet-400' : l.phase === 'design' ? 'bg-sky-400' : 'bg-slate-300')} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{d.phase}</p>
                      <p className="text-[13px] leading-snug text-slate-700">{d.who && <b className="font-semibold text-slate-900">{d.who} </b>}{d.text}</p>
                      {d.detail && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-slate-600">{d.detail}</p>}
                      {(d.lat != null && d.lng != null) && <GeoLabel lat={Number(d.lat)} lng={Number(d.lng)} />}
                      {d.imageUrl && (
                        <StepPhoto url={d.imageUrl} />
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(l.at)}{l.byRole === 'agent' && d.who ? ' · Agent' : ''}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {modal?.type === 'step' && (
        <StepForm
          step={modal.step}
          agents={activeAgents}
          roleOptions={roleOptions}
          onClose={close}
          onSubmit={(body) => (modal.step ? send(`/steps/${modal.step.id}`, { method: 'PUT', body }) : send('/steps', { method: 'POST', body }))}
        />
      )}
      {modal?.type === 'status' && (
        <StatusModal
          step={modal.step}
          status={modal.status}
          onClose={close}
          onSubmit={async (payload) => {
            const body = typeof payload === 'string' ? { status: modal.status, note: payload } : { status: modal.status, note: payload.note, lat: payload.lat, lng: payload.lng };
            if (payload?.photo) {
              const form = new FormData();
              form.append('file', payload.photo);
              body.imageUrl = (await api(`${base}/${id}/steps/${modal.step.id}/photo`, { method: 'POST', form })).url;
            }
            await send(`/steps/${modal.step.id}`, { method: 'PUT', body });
          }}
        />
      )}
      <ConfirmDialog open={modal?.type === 'removeStep'} onClose={close} onConfirm={() => confirm(() => send(`/steps/${modal.step.id}`, { method: 'DELETE' }))} busy={busy} error={modalError} title="Remove this step?" confirmLabel="Remove step">
        <b className="text-slate-900">{modal?.step?.name}</b> will be removed from this installation. The activity log keeps its history.
      </ConfirmDialog>
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={() => confirm(() => api(`${base}/${id}`, { method: 'DELETE' }), () => { toast.success('Installation deleted'); router.replace(back); })} busy={busy} error={modalError} title="Delete this installation?" confirmLabel="Delete installation">
        The steps and the whole activity log of <b className="text-slate-900">{design?.name}</b> will be permanently deleted. The proposal itself is kept.
      </ConfirmDialog>
    </>
  );
}

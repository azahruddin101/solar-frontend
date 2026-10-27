'use client';

// Maintenance as the client sees it. Two things only:
//  - "Your maintenance plan": the mandatory AMCs. Your provider schedules them and sends a technician — nothing to do.
//  - "Extra services": the optional AMCs. The client requests one on a date that suits them, as often as they like
//    (or the provider adds one for them); the provider assigns a technician, who completes the visit.
import { CalendarCheck, Check, CircleCheck, Plus, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, FormField, Input, Modal, RichTextContent, Textarea, cx, formatDate } from '../kit';

function toInputDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso) {
  if (!iso) return null;
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

/** "in 12 days", "today", "3 days ago". */
function relative(iso) {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** For the proposal picker: how many AMCs a proposal has. */
export function portalAmcListLabel(amcPackages) {
  if (!amcPackages) return null;
  const n = (amcPackages.included?.length || 0) + (amcPackages.services?.length || 0);
  return n ? `${n} AMC${n === 1 ? '' : 's'}` : null;
}

const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Where an included (mandatory) visit stands, in the client's words. */
function planStatus(p) {
  const v = p.visit;
  if (v?.status === 'completed') return { tone: 'green', label: 'Completed' };
  if (!v) return { tone: 'slate', label: 'After installation' };
  const days = daysUntil(v.dueDate);
  if (days !== null && days < 0) return { tone: 'amber', label: 'Due' };
  if (v.assignee) return { tone: 'brand', label: 'Technician assigned' };
  return { tone: 'slate', label: 'Scheduled' };
}

function requestBadge(request) {
  if (request.status === 'completed') return <Badge tone="green" dot>Completed</Badge>;
  if (request.status === 'assigned') return <Badge tone="brand" dot>Technician assigned</Badge>;
  return <Badge tone="amber" dot>Waiting for a technician</Badge>;
}

/** A calendar-style date block. */
function DateChip({ iso, done, className }) {
  const d = iso ? new Date(iso) : null;
  return (
    <span className={cx('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-center leading-none', done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-900', className)}>
      {d ? (
        <>
          <span className="text-[10px] font-semibold tracking-wider uppercase opacity-70">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
          <span className="mt-1 text-xl font-semibold tabular-nums">{d.getDate()}</span>
        </>
      ) : <CalendarCheck className="h-5 w-5 text-slate-400" />}
    </span>
  );
}

/** What the client should look at first: the nearest visit that has not happened yet. */
function nextVisit(included, services) {
  const open = [
    ...included.filter((p) => p.visit?.dueDate && p.visit.status !== 'completed').map((p) => ({ name: p.name, date: p.visit.dueDate, status: planStatus(p), tech: p.visit.assignee?.name || '' })),
    ...services.flatMap((p) => p.requests.filter((r) => r.status !== 'completed').map((r) => ({ name: p.name, date: r.requestedDate, status: { tone: r.status === 'assigned' ? 'brand' : 'amber', label: r.status === 'assigned' ? 'Technician assigned' : 'Waiting for a technician' }, tech: r.assignee?.name || '' }))),
  ];
  return open.sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;
}

function NextVisit({ visit }) {
  if (!visit) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-6 w-6" /></span>
        <div>
          <div className="text-base font-semibold text-slate-900">You’re all set</div>
          <p className="text-sm text-slate-600">No maintenance visit is due right now. We’ll let you know before the next one.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <DateChip iso={visit.date} className="h-16 w-16 border-brand/30 bg-brand-soft text-brand-ink" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold tracking-wide text-brand uppercase">Next visit · {relative(visit.date)}</div>
        <div className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">{visit.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span>{formatDate(visit.date)}</span>
          {visit.tech && <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5 text-slate-400" />{visit.tech}</span>}
        </div>
      </div>
      <Badge tone={visit.status.tone} dot>{visit.status.label}</Badge>
    </div>
  );
}

/** The mandatory AMCs, in order, with their dates. The provider does all the scheduling. */
function Plan({ included, amcPriceLabel }) {
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-900">Your maintenance plan</h3>
        <p className="text-sm text-slate-500">Your provider schedules these and sends a technician — there’s nothing for you to do.</p>
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {included.map((p) => {
          const st = planStatus(p);
          const done = p.visit?.status === 'completed';
          return (
            <li key={p.name} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <DateChip iso={p.visit?.dueDate} done={done} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{p.name}</div>
                <div className="text-sm text-slate-500">
                  {p.price > 0 ? `Included · ${amcPriceLabel(p.price)}` : 'Included · free'}
                  {p.visit?.dueDate && !done ? ` · ${relative(p.visit.dueDate)}` : ''}
                  {p.visit?.assignee?.name ? ` · ${p.visit.assignee.name}` : ''}
                </div>
              </div>
              <Badge tone={st.tone} dot>{st.label}</Badge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Date + note for one request (a new one when `request` is null); remounted (via key) when it changes. */
function RequestForm({ request, saving, submitLabel, onSubmit, onCancel }) {
  const [date, setDate] = useState(() => toInputDate(request?.requestedDate));
  const [note, setNote] = useState(request?.note || '');
  return (
    <div className="flex flex-col gap-3">
      <FormField label="Preferred visit date" htmlFor="amc-visit-date">
        <Input id="amc-visit-date" type="date" min={toInputDate(new Date().toISOString())} value={date} onValue={setDate} />
      </FormField>
      <FormField label="Note for your provider" optional htmlFor="amc-visit-note">
        <Textarea id="amc-visit-note" rows={2} maxLength={500} value={note} onValue={setNote} placeholder="Gate access, best time to call, etc." />
      </FormField>
      <div className="flex gap-2">
        <Button variant="primary" className="flex-1" loading={saving} disabled={saving || !date} onClick={() => date && onSubmit(date, note)}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

/** A service's requests, newest first. The client can move the date of their own open requests. */
function RequestList({ requests, editingId, onEdit }) {
  if (!requests.length) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Your requests</p>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {requests.map((r) => (
          <li key={r.id} className={cx('flex items-start justify-between gap-3 px-3 py-2.5 text-[13px]', editingId === r.id && 'bg-brand-soft/40')}>
            <div className="min-w-0 text-slate-600">
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5">{requestBadge(r)}{r.byCompany && <span className="text-xs text-slate-400">Added by your provider</span>}</div>
              {r.status === 'completed'
                ? <>Done{r.assignee?.name ? ` by ${r.assignee.name}` : ''} on {formatDate(r.requestedDate)}.</>
                : r.status === 'assigned'
                  ? <>{r.assignee?.name || 'A technician'} will visit on <strong>{formatDate(r.requestedDate)}</strong>.</>
                  : <>Requested for <strong>{formatDate(r.requestedDate)}</strong> — your provider will assign a technician.</>}
              {r.note && <div className="mt-0.5 truncate text-xs text-slate-400">“{r.note}”</div>}
            </div>
            {r.status !== 'completed' && !r.byCompany && onEdit && editingId !== r.id && (
              <Button size="sm" variant="ghost" onClick={() => onEdit(r.id)}>Change date</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One optional service as a card: what it is, the price, where its requests stand, and one button. */
function ServiceCard({ svc, amcPriceLabel, canRequest, onOpen }) {
  const open = svc.requests.filter((r) => r.status !== 'completed');
  const done = svc.requests.length - open.length;
  const blurb = plain(svc.description);
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-base font-semibold text-slate-900">{svc.name}</h4>
          <div className="mt-0.5 text-xs text-slate-500">Request it whenever you need it</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold text-slate-900 tabular-nums">{amcPriceLabel(svc.price)}</div>
          {svc.price > 0 && <div className="text-xs text-slate-500">per visit</div>}
        </div>
      </div>
      {blurb && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{blurb}</p>}
      {svc.requests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {open.map((r) => <Badge key={r.id} tone={r.status === 'assigned' ? 'brand' : 'amber'} dot>{formatDate(r.requestedDate)} · {r.status === 'assigned' ? 'Technician assigned' : 'Requested'}</Badge>)}
          {done > 0 && <Badge tone="green"><CircleCheck className="h-3 w-3" />{done} completed</Badge>}
        </div>
      )}
      <div className="mt-auto pt-4">
        {canRequest || svc.requests.length ? (
          <Button className="w-full" variant={open.length ? 'secondary' : 'primary'} icon={open.length ? undefined : Plus} onClick={onOpen}>
            {open.length ? 'Manage requests' : 'Request a visit'}
          </Button>
        ) : (
          <p className="text-center text-xs text-slate-500">Requests open once your proposal is accepted.</p>
        )}
      </div>
    </div>
  );
}

/** The request dialog for one service: its details, existing requests and the date form. */
function RequestDialog({ svc, canRequest, saving, amcPriceLabel, onSubmitRequest, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const editing = svc.requests.find((r) => r.id === editingId) || null;
  const submit = (requestId) => async (date, note) => {
    await onSubmitRequest?.(svc.name, date, note, requestId || undefined);
    setEditingId(null);
  };
  return (
    <Modal open onClose={onClose} size="lg" title={svc.name} description={`${amcPriceLabel(svc.price)}${svc.price > 0 ? ' per visit' : ''} · your provider assigns a technician after you request`}>
      {svc.description && <RichTextContent html={svc.description} className="mb-5 text-sm" />}
      <RequestList requests={svc.requests} editingId={editingId} onEdit={canRequest ? setEditingId : null} />
      {canRequest ? (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{editing ? `New date for the ${formatDate(editing.requestedDate)} request` : svc.requests.length ? 'Request another visit' : 'Request a visit'}</p>
          <RequestForm
            key={editing ? `edit:${editing.id}:${editing.requestedDate}` : `new:${svc.requests.length}`}
            request={editing}
            saving={saving}
            submitLabel={editing ? 'Update request' : 'Request visit'}
            onSubmit={submit(editing?.id)}
            onCancel={editing ? () => setEditingId(null) : null}
          />
        </>
      ) : !svc.requests.length && <Alert tone="info">Requests open once your proposal is accepted.</Alert>}
    </Modal>
  );
}

export default function PortalAmcPackagesCard({
  amcPackages,
  amcPriceLabel,
  savingPackage = null,
  onSubmitRequest,
  className = 'mb-5',
  id,
  embedded = false,
}) {
  const included = useMemo(() => amcPackages?.included || [], [amcPackages]);
  const services = useMemo(() => amcPackages?.services || [], [amcPackages]);
  const [requesting, setRequesting] = useState(null); // name of the service whose dialog is open
  if (!included.length && !services.length) return null;

  const canRequest = Boolean(amcPackages.canRequest && onSubmitRequest);
  const open = services.find((s) => s.name === requesting);

  const inner = (
    <div className="flex flex-col gap-8">
      <NextVisit visit={nextVisit(included, services)} />
      {included.length > 0 && <Plan included={included} amcPriceLabel={amcPriceLabel} />}
      {services.length > 0 && (
        <section>
          <div className="mb-3">
            <h3 className="text-base font-semibold text-slate-900">Extra services</h3>
            <p className="text-sm text-slate-500">Need something more? Pick a service and a date that suits you. Your provider will assign a technician.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {services.map((s) => <ServiceCard key={s.name} svc={s} amcPriceLabel={amcPriceLabel} canRequest={canRequest} onOpen={() => setRequesting(s.name)} />)}
          </div>
        </section>
      )}
      {open && <RequestDialog svc={open} canRequest={canRequest} saving={savingPackage === open.name} amcPriceLabel={amcPriceLabel} onSubmitRequest={onSubmitRequest} onClose={() => setRequesting(null)} />}
    </div>
  );

  if (embedded) {
    return <div id={id} className={className}>{inner}</div>;
  }

  return (
    <section id={id} className={className}>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Annual maintenance (AMC)</h2>
      {inner}
    </section>
  );
}

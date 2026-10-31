'use client';

// Installations as a Kanban board: a column per step of the workflow, then Completed. Each installation is a card in
// the column of the step it is on. Drag a card to the next column to finish its current step (the site location is
// required, as on the installation page), or back to an earlier column to reopen that step. Staff see the
// installations they are on and move a card only when the step concerned is theirs.
import { AlertTriangle, Clock, GripVertical, HardHat, Lock, Play, Search, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { stepPriority } from '@/lib/steps';
import { useCan } from '@/lib/useCan';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Input, LoadingBlock, PageHeader, Select, capName, cx, formatDate, toast } from '../kit';
import { KanbanBoard, KanbanCard, KanbanColumn, KanbanColumnHeader, flashCard } from '../kanban/Kanban';
import InstallationViewSwitch from './InstallationViewSwitch';
import { StatusModal } from './ProjectView';
import { Progress } from './shared';

const COMPLETED = 'completed';
const sinceDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

function CardBody({ card, locked, preview = false, onStart }) {
  const s = card.current;
  const p = s ? stepPriority(s) : null;
  return (
    <>
      <div className="flex items-start gap-2">
        {!preview && (locked ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-label="Not yours to move" /> : <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />)}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{capName(card.client || card.project)}</div>
          <div className="truncate text-xs text-slate-500">{card.project}{card.kwp ? ` · ${Number(card.kwp).toFixed(1)} kWp` : ''}</div>
        </div>
        {p && <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: p.color }}>{p.label}</span>}
      </div>
      <Progress project={{ steps: card.steps }} className="mt-2" />
      {s ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1 truncate"><User className="h-3 w-3 text-slate-400" />{s.assignee?.name || <span className="text-amber-700">{s.role ? `${s.role} · unassigned` : 'Unassigned'}</span>}</span>
          {s.status === 'in_progress' && s.startedAt ? (
            <span className={cx('inline-flex items-center gap-1 whitespace-nowrap', s.stuck ? 'font-medium text-red-600' : '')}>
              {s.stuck ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {sinceDays(s.startedAt) === 0 ? 'started today' : `${sinceDays(s.startedAt)} day${sinceDays(s.startedAt) === 1 ? '' : 's'} on this step`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-slate-500"><Clock className="h-3 w-3" />not started</span>
          )}
          {!preview && onStart && s.status === 'pending' && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onStart(); }} className="ml-auto inline-flex items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-ink hover:bg-brand/20"><Play className="h-3 w-3" />Start</button>
          )}
        </div>
      ) : (
        <div className="mt-2 text-xs text-emerald-700">Completed {card.installationCompletedAt ? formatDate(card.installationCompletedAt) : ''}</div>
      )}
    </>
  );
}

export default function StepBoard({ basePath = '/dashboard/installations' }) {
  const router = useRouter();
  const agent = basePath.startsWith('/agent');
  const apiBase = agent ? '/api/my/projects' : '/api/projects';
  const can = useCan();
  const mayChange = can('tasks', 'change_status');
  const mayAssign = !agent && can('tasks', 'assign');
  const assigneesRes = useResource(mayAssign ? '/api/projects/assignees' : null);
  const assignees = assigneesRes.data || [];

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('');
  const [state, setState] = useState({ columns: [], total: 0, open: 0, loading: true, error: '' });
  const [modal, setModal] = useState(null); // { card, step, status, to } — a move waiting for its note / location

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.columns.length === 0, error: '' }));
    try {
      const res = await api(`${apiBase}/board`);
      setState({ columns: res.columns || [], total: res.total || 0, open: res.open || 0, loading: false, error: '' });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const visible = (card) => (
    (!search || `${card.project} ${card.client} ${card.address} ${card.current?.assignee?.name || ''} ${card.current?.role || ''} ${card.current?.name || ''}`.toLowerCase().includes(search))
    && (!assignee || (assignee === 'none' ? card.current && !card.current.assignee : card.current?.assignee?.id === assignee))
    && (!priority || card.current?.priority === priority)
  );
  const columns = state.columns.map((c) => ({ ...c, cards: c.cards.filter(visible) }));
  const columnIndex = (id) => state.columns.findIndex((c) => c.id === id);
  const findCard = (id) => state.columns.flatMap((c) => c.cards).find((card) => card.id === id);

  /** May this card be dragged at all? The company: with the status permission. Staff: when the current step is theirs (or, done, any step of theirs to reopen). */
  const canDragCard = (card) => mayChange && (!agent || (card.current ? card.current.mine : card.steps.some((s) => s.mine)));

  /** Where may the dragged card land? One column forward (finish its step), or back to a step it has already done. */
  const accepts = (column) => (data) => {
    const card = findCard(data.id);
    if (!card) return false;
    if (column.id === COMPLETED) return Boolean(card.current) && !card.next && (!agent || card.current.mine); // finishing the last step
    const target = card.steps.find((s) => s.name === column.id);
    if (!target) return false; // this installation has no such step
    if (card.next && column.id === card.next.name && target.status !== 'done') return !agent || card.current.mine; // forward: finish the current step
    return target.status === 'done' && (!agent || target.mine); // back: reopen a done step
  };

  const send = async (card, step, status, body = {}) => {
    await api(`${apiBase}/${card.id}/steps/${step.id}`, { method: 'PUT', body: { status, ...body } });
    await load();
    flashCard(card.id);
  };

  const onMove = (data, toId) => {
    const card = findCard(data.id);
    if (!card) return;
    if (toId === COMPLETED || (card.next && toId === card.next.name)) {
      setModal({ card, step: card.current, status: 'done', to: toId === COMPLETED ? 'Completed' : toId }); // the site location is required
      return;
    }
    const target = card.steps.find((s) => s.name === toId);
    if (target) setModal({ card, step: target, status: 'in_progress', to: toId }); // reopen: a note, optional
  };

  const start = (card) => {
    send(card, card.current, 'in_progress').then(() => toast.success(`${card.current.name} started`)).catch((e) => toast.error(e.message));
  };

  const filtered = Boolean(search || assignee || priority);
  const stepColumns = state.columns.length - 1;

  return (
    <>
      <PageHeader title="Installation board" description={mayChange ? (agent ? 'Drag your installation to the next step when a step is done, or back to reopen one.' : 'Drag an installation to the next step to finish the current one, or back to reopen a step.') : 'Every installation on the step it is at. You can see the board but not move installations.'}>
        <div className="flex flex-wrap items-center gap-2">
          <InstallationViewSwitch view="board" basePath={basePath} />
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1 basis-[240px]">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
          <Input aria-label="Search installations" placeholder="Search installation, client, address or staff" value={query} onValue={setQuery} className="pl-9" />
        </div>
        {mayAssign && (
          <Select aria-label="Staff on the current step" value={assignee} onValue={setAssignee} className="w-48">
            <option value="">Anyone</option>
            <option value="none">Unassigned</option>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <Select aria-label="Priority of the current step" value={priority} onValue={setPriority} className="w-36">
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setAssignee(''); setPriority(''); }}>Clear</Button>}
        {!state.loading && <span className="ml-auto text-sm text-slate-500">{state.open} in progress · {state.total - state.open} completed</span>}
      </div>

      {state.error && <Alert className="mb-4">{state.error}</Alert>}

      {state.loading ? <LoadingBlock /> : state.total === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <HardHat className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No installations yet</p>
          <p className="mt-1 text-xs text-slate-500">Start one from the list and it appears here on its first step.</p>
          <Link href={basePath} className="mt-4 text-sm font-medium text-brand hover:underline">Go to the list</Link>
        </div>
      ) : (
        <KanbanBoard type="installation" onMove={onMove} className="h-[calc(100vh-17rem)] min-h-[24rem]">
          {columns.map((column, i) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              width="w-80"
              label={`${column.name}: ${column.cards.length} installation${column.cards.length === 1 ? '' : 's'}`}
              droppable={mayChange ? accepts(column) : false}
              header={(
                <KanbanColumnHeader color={column.id === COMPLETED ? '#10b981' : i === 0 ? '#94a3b8' : '#f59e0b'} name={column.name} count={column.cards.length}>
                  {column.id !== COMPLETED && <span className="text-[11px] font-medium text-slate-400">step {i + 1} of {stepColumns}</span>}
                </KanbanColumnHeader>
              )}
              empty={column.cards.length === 0 ? (filtered ? 'Nothing matches here' : column.id === COMPLETED ? 'Nothing completed yet' : 'No installation on this step') : null}
            >
              {column.cards.map((card) => (
                <KanbanCard key={card.id} id={card.id} columnId={column.id} canDrag={canDragCard(card)} onOpen={() => router.push(`${basePath}/${card.id}`)} preview={<CardBody card={card} preview />}>
                  <CardBody card={card} locked={!canDragCard(card)} onStart={mayChange && card.current && (!agent || card.current.mine) ? () => start(card) : null} />
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </KanbanBoard>
      )}

      {modal && (
        <StatusModal
          step={{ ...modal.step, name: `${modal.step.name} · ${capName(modal.card.client || modal.card.project)}` }}
          status={modal.status}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const body = typeof payload === 'string' ? { note: payload } : { note: payload.note, lat: payload.lat, lng: payload.lng };
            if (payload?.photo) {
              const form = new FormData();
              form.append('file', payload.photo);
              body.imageUrl = (await api(`${apiBase}/${modal.card.id}/steps/${modal.step.id}/photo`, { method: 'POST', form })).url;
            }
            await send(modal.card, modal.step, modal.status, body);
            toast.success(modal.status === 'done' ? `${modal.step.name} done → ${modal.to}` : `${modal.step.name} reopened`);
          }}
        />
      )}
    </>
  );
}

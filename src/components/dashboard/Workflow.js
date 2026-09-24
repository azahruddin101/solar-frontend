'use client';

// The company's installation step template: any number of steps, in the company's own order.
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { agentRolesFor } from '@/lib/agents';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, EmptyState, IconButton, Input, LoadingBlock, PageHeader, Select, showError, toast } from '../kit';

const SUGGESTED = ['Site inspection', 'Material procurement', 'Structure installation', 'Panel & electrical installation', 'Testing & handover'];
const MAX = 30;
let seq = 0;
const blank = (name = '') => ({ key: `new-${++seq}`, name, description: '', role: '' });

export default function Workflow() {
  const { company } = useSession();
  const roleOptions = agentRolesFor(company);
  const saved = useResource('/api/projects/steps');
  const [steps, setSteps] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (list) => setSteps(list.map((s) => ({ key: s.id, name: s.name, description: s.description, role: s.role || '' })));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved.data && !steps) load(saved.data);
  }, [saved.data, steps]);

  const change = (fn) => { setSteps(fn); setDirty(true); };
  const patch = (key, p) => change((list) => list.map((s) => (s.key === key ? { ...s, ...p } : s)));
  const move = (i, by) => change((list) => {
    const next = [...list];
    next.splice(i + by, 0, next.splice(i, 1)[0]);
    return next;
  });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      load(await api('/api/projects/steps', { method: 'PUT', body: { steps: steps.map((s) => ({ name: s.name, description: s.description, role: s.role || null })) } }));
      setDirty(false);
      toast.success('Installation steps saved');
    } catch (err) {
      showError(err, 'The steps were not saved');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save}>
      <PageHeader title="Installation steps" description="The steps your company follows from an accepted design to a working system. Every new installation starts with a copy of this list.">
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>Save steps</Button>
      </PageHeader>
      {saved.error && <Alert className="mb-6">{saved.error}</Alert>}

      <Card className="overflow-hidden">
        <CardHeader title="Your steps" description="Order matters: step 1 comes first. Changes apply to installations you start from now on." action={steps?.length > 0 && <Button size="sm" icon={Plus} disabled={steps.length >= MAX} onClick={() => change((l) => [...l, blank()])}>Add step</Button>} />
        {!steps ? <LoadingBlock /> : !steps.length ? (
          <EmptyState icon={ListChecks} title="No steps yet" description="Start from the usual rooftop solar steps and adjust them, or build your own list.">
            <Button variant="primary" onClick={() => change(() => SUGGESTED.map(blank))}>Use suggested steps</Button>
            <Button icon={Plus} onClick={() => change(() => [blank()])}>Start from scratch</Button>
          </EmptyState>
        ) : (
          <ol>
            {steps.map((s, i) => (
              <li key={s.key} className="flex gap-4 border-b border-slate-100 px-6 py-4 last:border-0">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-ink">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[1fr_220px]">
                  <Input aria-label={`Step ${i + 1} name`} required maxLength={80} value={s.name} onValue={(v) => patch(s.key, { name: v })} placeholder="Step name, e.g. Site inspection" />
                  <Select aria-label={`Step ${i + 1} role`} value={s.role} onValue={(v) => patch(s.key, { role: v })}>
                    <option value="">Any role / assign later</option>
                    {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <Input aria-label={`Step ${i + 1} description`} maxLength={400} value={s.description} onValue={(v) => patch(s.key, { description: v })} placeholder="What needs doing (optional)" className="md:col-span-2" />
                </div>
                <div className="flex shrink-0 items-start pt-1">
                  <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} className="disabled:opacity-30" onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Move down" disabled={i === steps.length - 1} className="disabled:opacity-30" onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label="Remove step" tone="danger" onClick={() => change((l) => l.filter((x) => x.key !== s.key))} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {steps?.length > 0 && !roleOptions.length && (
        <Alert tone="info" className="mt-4">
          Define roles under <Link href="/dashboard/agent-roles" className="font-medium underline">Agent roles</Link>, then pick which role should handle each step (e.g. site inspection → Site surveyor).
        </Alert>
      )}
    </form>
  );
}

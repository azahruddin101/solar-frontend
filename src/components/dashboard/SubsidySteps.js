'use client';

// The company's subsidy step template: the steps every client buying with a subsidy goes through, in the company's order.
import { ArrowDown, ArrowUp, BadgeIndianRupee, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { Alert, Button, Card, CardHeader, EmptyState, IconButton, Input, LoadingBlock, PageHeader, showError, toast } from '../kit';

const SUGGESTED = ['Documents collected', 'Registered on the portal', 'Application approved', 'Installation reported', 'Net meter & inspection', 'Commissioning & claim', 'Subsidy credited'];
const MAX = 30;
let seq = 0;
const blank = (name = '') => ({ key: `new-${++seq}`, name, description: '' });

export default function SubsidySteps() {
  const saved = useResource('/api/subsidies/steps');
  const [steps, setSteps] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = (list) => setSteps(list.map((s) => ({ key: s.id, name: s.name, description: s.description || '' })));
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
      load(await api('/api/subsidies/steps', { method: 'PUT', body: { steps: steps.map((s) => ({ name: s.name, description: s.description })) } }));
      setDirty(false);
      toast.success('Subsidy steps saved');
    } catch (err) {
      showError(err, 'The steps were not saved');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save}>
      <PageHeader title="Subsidy steps" description="The steps a client buying with a subsidy goes through, from documents to disbursement. Every new subsidy starts with a copy of this list, and the client can follow it in their portal.">
        <Button type="submit" variant="primary" loading={busy} disabled={!dirty}>Save steps</Button>
      </PageHeader>
      {saved.error && <Alert className="mb-6">{saved.error}</Alert>}

      <Card className="overflow-hidden">
        <CardHeader title="Your steps" description="Order matters: step 1 comes first. Subsidies already open keep their steps; add new ones to them from the subsidy’s page." action={steps?.length > 0 && <Button size="sm" icon={Plus} disabled={steps.length >= MAX} onClick={() => change((l) => [...l, blank()])}>Add step</Button>} />
        {!steps ? <LoadingBlock /> : !steps.length ? (
          <EmptyState icon={BadgeIndianRupee} title="No subsidy steps yet" description="Start from the usual solar subsidy steps and adjust them, or build your own list.">
            <Button variant="primary" onClick={() => change(() => SUGGESTED.map((name) => blank(name)))}>Use suggested steps</Button>
            <Button icon={Plus} onClick={() => change(() => [blank()])}>Start from scratch</Button>
          </EmptyState>
        ) : (
          <ol>
            {steps.map((s, i) => (
              <li key={s.key} className="flex gap-4 border-b border-slate-100 px-6 py-4 last:border-b-0">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand-ink">{i + 1}</span>
                <div className="grid min-w-0 flex-1 gap-2">
                  <Input aria-label={`Step ${i + 1} name`} required maxLength={80} value={s.name} onValue={(v) => patch(s.key, { name: v })} placeholder="Step name, e.g. Documents collected" />
                  <Input aria-label={`Step ${i + 1} description`} maxLength={400} value={s.description} onValue={(v) => patch(s.key, { description: v })} placeholder="What happens in this step (optional, shown to the client)" />
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
    </form>
  );
}

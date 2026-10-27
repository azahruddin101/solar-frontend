'use client';

// The company adds an AMC visit to an installation: which job, which AMC, when, and optionally who does it.
import { useState } from 'react';
import { api } from '@/lib/api';
import { useResource } from '@/lib/useResource';
import { FormField, FormModal, Input, Select, Textarea, toast } from '../kit';

const today = () => new Date().toISOString().slice(0, 10);

/** `amcs`: [{ name, kind }] from the AMC schedule. `staff`: active staff to pick from. */
export default function AmcVisitCreateModal({ amcs, staff, onClose, onCreated }) {
  const { data: projects, loading } = useResource('/api/projects?limit=1000');
  const jobs = projects?.items || [];
  const [project, setProject] = useState('');
  const [name, setName] = useState(amcs.find((a) => a.kind === 'optional')?.name || amcs[0]?.name || '');
  const [date, setDate] = useState(today());
  const [assigneeId, setAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!project) return setError('Choose the job this visit is for');
    if (!name) return setError('Choose the AMC');
    if (!date) return setError('Choose a date');
    setBusy(true);
    setError('');
    try {
      await api(`/api/projects/${project}/amc`, { method: 'POST', body: { name, date, note, assigneeId } });
      toast.success(`${name} added${assigneeId ? ' and assigned' : ''}`);
      onCreated();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size="md" title="Add an AMC visit" description="Add a maintenance visit to a job — for example an optional AMC the client asked for by phone." submitLabel="Add visit" busy={busy} error={error} onSubmit={submit}>
      <FormField label="Job">
        <Select value={project} onValue={setProject} disabled={loading}>
          <option value="">{loading ? 'Loading…' : 'Choose a job…'}</option>
          {jobs.map((p) => <option key={p.id} value={p.id}>{p.design?.name || 'Installation'}{p.client?.name ? ` — ${p.client.name}` : ''}</option>)}
        </Select>
      </FormField>
      <FormField label="AMC">
        <Select value={name} onValue={setName}>
          {amcs.map((a) => <option key={a.name} value={a.name}>{a.name} · {a.kind === 'optional' ? 'Optional' : 'Mandatory'}</option>)}
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Date">
          <Input type="date" value={date} onValue={setDate} />
        </FormField>
        <FormField label="Assign staff" optional>
          <Select value={assigneeId} onValue={setAssigneeId}>
            <option value="">Assign later</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </FormField>
      </div>
      <FormField label="Note" optional>
        <Textarea rows={2} maxLength={500} value={note} onValue={setNote} placeholder="Anything the technician should know" />
      </FormField>
    </FormModal>
  );
}

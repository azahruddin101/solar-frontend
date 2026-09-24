'use client';

// Company-specific role labels — agents can be assigned one or more when you add them to the team.
import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MAX_AGENT_ROLES, agentRolesFor } from '@/lib/agents';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Input, PageHeader, showError, toast } from '../kit';

let seq = 0;

const toRows = (roles) => roles.map((r) => ({ id: ++seq, role: r }));

export default function AgentRolesPage() {
  const { company, setCompany } = useSession();
  const savedRoles = agentRolesFor(company);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => toRows(savedRoles));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setRows(toRows(agentRolesFor(company)));
  }, [company?.agentRoles, editing]);

  const cancel = () => {
    setRows(toRows(agentRolesFor(company)));
    setEditing(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const agentRoles = rows.map((r) => r.role.trim()).filter(Boolean);
      setCompany(await api('/api/company', { method: 'PUT', body: { agentRoles } }));
      toast.success('Roles saved');
      setEditing(false);
    } catch (err) {
      showError(err, 'Roles were not saved');
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Agent roles"
        description="Job titles your field staff can hold. When you add someone to the team, pick one or more roles from this list."
      >
        {!editing && (
          <Button variant="primary" icon={Pencil} onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </PageHeader>

      <Card className="max-w-2xl p-6">
        {editing ? (
          <form onSubmit={save} className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center">
                  <Input
                    aria-label="Role name"
                    maxLength={40}
                    value={r.role}
                    onValue={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, role: v } : x)))}
                    placeholder="e.g. Electrician"
                    className="w-40 rounded-r-none sm:w-48"
                  />
                  <button
                    type="button"
                    aria-label="Remove role"
                    disabled={rows.length <= 1}
                    onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    className="grid h-10 w-9 place-items-center rounded-r-lg border border-l-0 border-slate-300 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" icon={Plus} disabled={rows.length >= MAX_AGENT_ROLES} onClick={() => setRows([...rows, { id: ++seq, role: '' }])}>
                Add role
              </Button>
              <Button type="submit" variant="primary" loading={busy}>Save</Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {savedRoles.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        )}

        <p className="mt-5 text-xs text-slate-500">These names appear when you add or edit agents on the Team page. An agent can have several roles at once.</p>
      </Card>
    </>
  );
}

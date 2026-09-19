'use client';

// Super admin: add companies and control their access, plan, limits and features.
import { Ban, Building2, CheckCircle2, KeyRound, LogIn, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useResource } from '@/lib/useResource';
import { Alert, LogoChip, Button, Card, ConfirmDialog, EmptyState, FormField, FormModal, IconButton, Input, LoadingBlock, PageHeader, Select, Table, Tabs, Td, Textarea, Th, Toggle, Tr, formatDate, timeAgo, toast } from '../kit';
import { PLANS, PlanBadge, StatusBadge } from './shared';

const BLANK = { name: '', contactName: '', loginEmail: '', password: '', phone: '', address: '', website: '', taxId: '', plan: 'starter', status: 'active', notes: '', limits: { maxClients: 0, maxDesigns: 0 }, features: { pdfBranding: true, excelImport: true } };

const randomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(12)), (n) => chars[n % chars.length]).join('');
};

function CompanyForm({ company, onClose, onSaved }) {
  const editing = Boolean(company?.id);
  const [form, setForm] = useState(() => (editing ? { ...BLANK, ...company, limits: { ...BLANK.limits, ...company.limits }, features: { ...BLANK.features, ...company.features } } : { ...BLANK, password: randomPassword() }));
  const [tab, setTab] = useState('profile');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const saved = editing ? await api(`/api/admin/companies/${company.id}`, { method: 'PATCH', body: form }) : await api('/api/admin/companies', { method: 'POST', body: form });
      onSaved(saved, editing ? null : { email: form.loginEmail, password: form.password });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <FormModal open onClose={onClose} size="lg" title={editing ? `Edit ${company.name}` : 'Add a company'} description={editing ? undefined : 'Creates the company workspace and its sign-in.'} submitLabel={editing ? 'Save changes' : 'Create company'} busy={busy} error={error} onSubmit={submit} onInvalid={() => setTab('profile')}>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'profile', label: 'Company & sign-in' }, { id: 'access', label: 'Plan & limits' }, { id: 'features', label: 'Features' }]} />
      {/* keep every tab mounted so required fields still validate on submit */}
      <div className={tab === 'profile' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <FormField label="Company name" className="sm:col-span-2"><Input required maxLength={120} value={form.name} onValue={(v) => set({ name: v })} placeholder="Sunrise Solar Pvt Ltd" /></FormField>
        <FormField label="Sign-in email"><Input type="email" required value={form.loginEmail} onValue={(v) => set({ loginEmail: v })} placeholder="owner@company.com" /></FormField>
        {editing ? <FormField label="Contact person" optional><Input value={form.contactName} onValue={(v) => set({ contactName: v })} /></FormField> : (
          <FormField label="Temporary password" hint="Share it with the company; they can change it after signing in.">
            <div className="flex gap-2"><Input required minLength={8} value={form.password} onValue={(v) => set({ password: v })} className="font-mono" /><Button onClick={() => set({ password: randomPassword() })}>Generate</Button></div>
          </FormField>
        )}
        {!editing && <FormField label="Contact person" optional><Input value={form.contactName} onValue={(v) => set({ contactName: v })} /></FormField>}
        <FormField label="Phone" optional><Input value={form.phone} onValue={(v) => set({ phone: v })} /></FormField>
        <FormField label="Website" optional><Input value={form.website} onValue={(v) => set({ website: v })} placeholder="www.company.com" /></FormField>
        <FormField label="GSTIN / Tax ID" optional><Input value={form.taxId} onValue={(v) => set({ taxId: v })} /></FormField>
        <FormField label="Address" optional className="sm:col-span-2"><Textarea rows={2} value={form.address} onValue={(v) => set({ address: v })} /></FormField>
      </div>
      <div className={tab === 'access' ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <FormField label="Plan"><Select value={form.plan} onValue={(v) => set({ plan: v })}>{PLANS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select></FormField>
        <FormField label="Status" hint="Suspended companies cannot sign in."><Select value={form.status} onValue={(v) => set({ status: v })}><option value="active">Active</option><option value="suspended">Suspended</option></Select></FormField>
        <FormField label="Maximum clients" hint="0 means unlimited."><Input type="number" min={0} value={form.limits.maxClients} onValue={(v) => set({ limits: { ...form.limits, maxClients: Number(v) || 0 } })} /></FormField>
        <FormField label="Maximum designs" hint="0 means unlimited."><Input type="number" min={0} value={form.limits.maxDesigns} onValue={(v) => set({ limits: { ...form.limits, maxDesigns: Number(v) || 0 } })} /></FormField>
        <FormField label="Internal notes" optional hint="Only visible to super admins." className="sm:col-span-2"><Textarea value={form.notes} onValue={(v) => set({ notes: v })} maxLength={1000} /></FormField>
      </div>
      <div className={tab === 'features' ? 'space-y-5' : 'hidden'}>
        <Toggle label="Branded PDF proposals" description="Company logo, colours, e-signature and QR code on generated PDFs." checked={form.features.pdfBranding} onChange={(v) => set({ features: { ...form.features, pdfBranding: v } })} />
        <Toggle label="Excel import for solar panels" description="Bulk upload the panel catalog from .xlsx or .csv." checked={form.features.excelImport} onChange={(v) => set({ features: { ...form.features, excelImport: v } })} />
      </div>
    </FormModal>
  );
}

function PasswordModal({ company, onClose }) {
  const [password, setPassword] = useState(randomPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/companies/${company.id}/password`, { method: 'POST', body: { password } });
      toast.success(`Password reset for ${company.name}`);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <FormModal open onClose={onClose} size="sm" title="Reset password" description={`${company.name} · ${company.loginEmail}`} submitLabel="Reset password" busy={busy} error={error} onSubmit={submit}>
      <FormField label="New password" hint="Copy it now — it is not shown again.">
        <div className="flex gap-2"><Input required minLength={8} value={password} onValue={setPassword} className="font-mono" /><Button onClick={() => setPassword(randomPassword())}>Generate</Button></div>
      </FormField>
    </FormModal>
  );
}

export default function AdminCompanies() {
  const router = useRouter();
  const params = useSearchParams();
  const impersonate = useSession((s) => s.impersonate);
  const { data, setData, loading, error } = useResource('/api/admin/companies');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [modal, setModal] = useState(null); // {type, company}
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    if (params.get('new')) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModal({ type: 'form' });
      router.replace('/admin/companies');
    }
  }, [params, router]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((c) => (status === 'all' || c.status === status) && (!q || `${c.name} ${c.loginEmail} ${c.phone}`.toLowerCase().includes(q)));
  }, [data, query, status]);

  const close = () => { setModal(null); setModalError(''); };
  const upsert = (c) => setData((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));

  const setCompanyStatus = async (c, next) => {
    try {
      upsert(await api(`/api/admin/companies/${c.id}`, { method: 'PATCH', body: { status: next } }));
      toast.success(next === 'active' ? `${c.name} is active again` : `${c.name} has been suspended`);
    } catch (e) {
      toast.error(e.message);
    }
  };
  const openWorkspace = async (c) => {
    try {
      await impersonate(c.id);
      router.push('/dashboard');
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/companies/${modal.company.id}`, { method: 'DELETE' });
      setData((list) => list.filter((x) => x.id !== modal.company.id));
      toast.success('Company deleted');
      close();
    } catch (e) {
      setModalError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Companies" description="Solar companies with a workspace on the platform.">
        <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add company</Button>
      </PageHeader>
      {error && <Alert className="mb-6">{error}</Alert>}
      {created && (
        <Alert tone="success" className="mb-6">
          <b>{created.name}</b> is ready. Share these sign-in details: <span className="font-mono">{created.email}</span> / <span className="font-mono">{created.password}</span>
          <button type="button" className="ml-2 font-semibold underline" onClick={() => setCreated(null)}>Dismiss</button>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input aria-label="Search companies" placeholder="Search by name, email or phone" value={query} onValue={setQuery} className="pl-9" />
          </div>
          <Select aria-label="Filter by status" value={status} onValue={setStatus} className="w-40"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></Select>
        </div>
        {loading ? <LoadingBlock /> : !rows.length ? (
          <EmptyState icon={Building2} title={data?.length ? 'No companies match' : 'No companies yet'} description={data?.length ? 'Try a different search or filter.' : 'Add a company to give it a workspace and sign-in.'}>
            {!data?.length && <Button variant="primary" icon={Plus} onClick={() => setModal({ type: 'form' })}>Add company</Button>}
          </EmptyState>
        ) : (
          <Table>
            <thead><tr><Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Usage</Th><Th>Last sign-in</Th><Th>Added</Th><Th className="text-right">Actions</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <LogoChip name={c.name} src={assetUrl(c.logo)} />
                      <div className="min-w-0"><div className="max-w-[220px] truncate font-medium text-slate-900">{c.name}</div><div className="max-w-[220px] truncate text-xs text-slate-500">{c.loginEmail}</div></div>
                    </div>
                  </Td>
                  <Td><PlanBadge plan={c.plan} /></Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td className="text-[13px] leading-snug whitespace-nowrap text-slate-500">
                    <div><span className="text-slate-800 tabular-nums">{c.counts.clients}</span>{c.limits.maxClients ? ` / ${c.limits.maxClients}` : ''} {c.counts.clients === 1 ? 'client' : 'clients'}</div>
                    <div><span className="text-slate-800 tabular-nums">{c.counts.designs}</span>{c.limits.maxDesigns ? ` / ${c.limits.maxDesigns}` : ''} {c.counts.designs === 1 ? 'design' : 'designs'}</div>
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{timeAgo(c.lastLoginAt)}</Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(c.createdAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-0.5">
                      <IconButton icon={LogIn} label="Open workspace as this company" onClick={() => openWorkspace(c)} disabled={c.status !== 'active'} className="disabled:opacity-30" />
                      <IconButton icon={Pencil} label="Edit" onClick={() => setModal({ type: 'form', company: c })} />
                      <IconButton icon={KeyRound} label="Reset password" onClick={() => setModal({ type: 'password', company: c })} />
                      {c.status === 'active' ? <IconButton icon={Ban} label="Suspend" tone="danger" onClick={() => setCompanyStatus(c, 'suspended')} /> : <IconButton icon={CheckCircle2} label="Activate" onClick={() => setCompanyStatus(c, 'active')} />}
                      <IconButton icon={Trash2} label="Delete" tone="danger" onClick={() => setModal({ type: 'delete', company: c })} />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modal?.type === 'form' && (
        <CompanyForm
          company={modal.company}
          onClose={close}
          onSaved={(c, credentials) => {
            upsert(c);
            if (credentials) setCreated({ name: c.name, ...credentials });
            else toast.success('Company updated');
            close();
          }}
        />
      )}
      {modal?.type === 'password' && <PasswordModal company={modal.company} onClose={close} />}
      <ConfirmDialog open={modal?.type === 'delete'} onClose={close} onConfirm={remove} busy={busy} error={modalError} title="Delete this company?" confirmLabel="Delete company">
        <b className="text-slate-900">{modal?.company?.name}</b> and everything in its workspace — {modal?.company?.counts.clients} clients, {modal?.company?.counts.designs} designs, its catalog and branding — will be permanently deleted. To block access without losing data, suspend it instead.
      </ConfirmDialog>
    </>
  );
}

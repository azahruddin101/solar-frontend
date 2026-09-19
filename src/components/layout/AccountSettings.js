'use client';

// Name + password for whoever is signed in (super admin or company).
import { useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Alert, Button, Card, CardHeader, FormField, Input, toast } from '../kit';

export default function AccountSettings() {
  const { user, impersonated, apply } = useSession();
  const [name, setName] = useState(user.name || '');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const saveName = async (e) => {
    e.preventDefault();
    setBusy('name');
    try {
      apply(await api('/api/auth/me', { method: 'PUT', body: { name } }));
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy('');
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.next !== pw.confirm) return setError('The new passwords do not match');
    setBusy('pw');
    try {
      await api('/api/auth/password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader title="Your details" description="Shown in the sidebar and used as the sign-in email." />
        <form onSubmit={saveName} className="grid gap-4 p-6 sm:grid-cols-2">
          <FormField label="Name"><Input value={name} onValue={setName} maxLength={120} /></FormField>
          <FormField label="Sign-in email" hint={user.role === 'company' ? 'Only the platform administrator can change this.' : undefined}><Input value={user.email} disabled /></FormField>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy === 'name'}>Save</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Password" description="Use at least 8 characters." />
        <form onSubmit={savePassword} className="grid gap-4 p-6 sm:grid-cols-2">
          {impersonated && <Alert tone="warn" className="sm:col-span-2">You are signed in as this company. Reset its password from the admin console instead.</Alert>}
          {error && <Alert className="sm:col-span-2">{error}</Alert>}
          <FormField label="Current password" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]"><Input type="password" autoComplete="current-password" required value={pw.current} onValue={(v) => setPw({ ...pw, current: v })} disabled={impersonated} /></FormField>
          <FormField label="New password"><Input type="password" autoComplete="new-password" required minLength={8} value={pw.next} onValue={(v) => setPw({ ...pw, next: v })} disabled={impersonated} /></FormField>
          <FormField label="Confirm new password"><Input type="password" autoComplete="new-password" required minLength={8} value={pw.confirm} onValue={(v) => setPw({ ...pw, confirm: v })} disabled={impersonated} /></FormField>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy === 'pw'} disabled={impersonated}>Change password</Button></div>
        </form>
      </Card>
    </div>
  );
}

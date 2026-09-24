'use client';

// Name + password for whoever is signed in (super admin, company or agent).
import { useState } from 'react';
import { api, tokens } from '@/lib/api';
import { useSession } from '@/lib/session';
import { passwordChangeSchema, profileSchema, useValidation } from '@/lib/validation';
import { Alert, Button, Card, CardHeader, FormField, Input, NameInput, PasswordInput, showError, toast } from '../kit';

export default function AccountSettings() {
  const { user, impersonated, apply } = useSession();
  const [name, setName] = useState(user.name || '');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const vName = useValidation(profileSchema, { name });
  const vPw = useValidation(passwordChangeSchema, { current: pw.current, next: pw.next });

  const saveName = async (e) => {
    e.preventDefault();
    if (!vName.validate()) return;
    setBusy('name');
    try {
      apply(await api('/api/auth/me', { method: 'PUT', body: { name } }));
      toast.success('Profile updated');
    } catch (err) {
      showError(err, 'Your profile was not saved');
    }
    setBusy('');
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (!vPw.validate()) return;
    if (pw.next !== pw.confirm) return showError('The new password and its confirmation do not match.', 'Check the new password');
    setBusy('pw');
    try {
      const res = await api('/api/auth/password', { method: 'POST', body: { current: pw.current, next: pw.next } });
      if (res?.token) tokens.set(res.token); // other devices are signed out; this one continues on a fresh token
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      showError(err, 'The password was not changed');
    }
    setBusy('');
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader title="Your details" description="Shown in the sidebar and used as the sign-in email." />
        <form onSubmit={saveName} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
          <FormField label="Name" optional error={vName.error('name')}><NameInput value={name} onValue={setName} maxLength={120} /></FormField>
          <FormField label="Sign-in email" hint={user.role === 'company' ? 'Only the platform administrator can change this.' : user.role === 'agent' ? 'Only your company can change this.' : undefined}><Input value={user.email} disabled /></FormField>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy === 'name'}>Save</Button></div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Password" description="At least 8 characters, with a letter and a number." />
        <form onSubmit={savePassword} noValidate className="grid gap-4 p-6 sm:grid-cols-2">
          {impersonated && <Alert tone="warn" className="sm:col-span-2">You are signed in as this company. Reset its password from the admin console instead.</Alert>}
          <FormField label="Current password" className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]" error={vPw.error('current')}><PasswordInput autoComplete="current-password" value={pw.current} onValue={(v) => setPw({ ...pw, current: v })} disabled={impersonated} /></FormField>
          <FormField label="New password" error={vPw.error('next')}><PasswordInput autoComplete="new-password" value={pw.next} onValue={(v) => setPw({ ...pw, next: v })} disabled={impersonated} /></FormField>
          <FormField label="Confirm new password" error={pw.confirm && pw.confirm !== pw.next ? 'Does not match the new password' : undefined}><PasswordInput autoComplete="new-password" value={pw.confirm} onValue={(v) => setPw({ ...pw, confirm: v })} disabled={impersonated} /></FormField>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={busy === 'pw'} disabled={impersonated}>Change password</Button></div>
        </form>
      </Card>
    </div>
  );
}

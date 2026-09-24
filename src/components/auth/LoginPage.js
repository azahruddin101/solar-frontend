'use client';

import { ArrowRight, BadgeCheck, FileText, Palette, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { homeFor, useSession } from '@/lib/session';
import { loginSchema, useValidation } from '@/lib/validation';
import { Alert, Button, FormField, FullPageLoader, Input, PasswordInput } from '../kit';
import { BrandLogo } from '../layout/Brand';

const POINTS = [
  [Users, 'Your clients in one place', 'Keep every customer, site and proposal organised.'],
  [Palette, 'Your brand on everything', 'Logo, colours, e-signature and QR code on each PDF.'],
  [FileText, 'Proposals in minutes', 'Roof to priced 3D design to a signed-ready document.'],
];

export default function LoginPage() {
  const router = useRouter();
  const { status, user, init, login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deviceSessions, setDeviceSessions] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    init();
  }, [init]);
  useEffect(() => {
    if (status === 'ready') router.replace(homeFor(user.role));
  }, [status, user, router]);

  const v = useValidation(loginSchema, { email, password });
  const submit = async (e, replaceSessions = false) => {
    e?.preventDefault?.();
    const data = v.validate();
    if (!data) return;
    setBusy(true);
    setError('');
    if (!replaceSessions) setDeviceSessions(null);
    try {
      await login(data.email, password, { replaceSessions });
    } catch (err) {
      setError(err.message);
      if (err.code === 'DEVICE_LIMIT' && err.details?.sessions?.length) setDeviceSessions(err.details.sessions);
      setBusy(false);
    }
  };

  if (status !== 'guest') return <FullPageLoader />;
  return (
    <div className="grid h-dvh overflow-y-auto bg-white lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-brand opacity-30 blur-[120px]" />
        <div aria-hidden className="absolute -right-32 -bottom-48 h-[480px] w-[480px] rounded-full bg-accent opacity-20 blur-[120px]" />
        <Link href="/" className="relative"><BrandLogo dark /></Link>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-[1.15] font-semibold tracking-tight">The solar design workspace for installers.</h1>
          <ul className="mt-10 space-y-6">
            {POINTS.map(([Icon, title, text]) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/10"><Icon className="h-5 w-5 text-accent" /></span>
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="mt-0.5 text-sm text-slate-400">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-slate-500"><BadgeCheck className="h-4 w-4" /> Each company’s data is private to that company.</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden"><BrandLogo /></Link>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">Use the email and password for your company or admin account.</p>
          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            {error && (
              <Alert>
                {error}
                {deviceSessions && (
                  <ul className="mt-3 space-y-1.5 border-t border-red-200/60 pt-3 text-[13px] font-normal text-slate-700">
                    {deviceSessions.map((s) => (
                      <li key={s.sessionId}>
                        <span className="font-medium text-slate-900">{s.userName}</span>
                        {' · '}{s.device}
                      </li>
                    ))}
                  </ul>
                )}
                {deviceSessions && (
                  <div className="mt-3 space-y-2 border-t border-red-200/60 pt-3">
                    <p className="text-[13px] font-normal text-slate-600">Can’t reach that device? Sign out all other devices and continue here (your password is verified again).</p>
                    <Button type="button" variant="secondary" size="sm" loading={busy} onClick={(e) => submit(e, true)}>Sign out other devices and sign in</Button>
                  </div>
                )}
              </Alert>
            )}
            <FormField label="Email" error={v.error('email')}>
              <Input type="email" autoComplete="email" autoFocus value={email} onValue={setEmail} placeholder="you@company.com" className="h-11" />
            </FormField>
            <FormField label="Password" error={v.error('password')}>
              <PasswordInput autoComplete="current-password" value={password} onValue={setPassword} className="h-11" />
            </FormField>
            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">Sign in {!busy && <ArrowRight className="h-4 w-4" />}</Button>
          </form>
          <p className="mt-8 text-[13px] leading-relaxed text-slate-500">Company accounts are created by the platform administrator. Forgot your password? Ask your administrator to reset it.</p>
        </div>
      </div>
    </div>
  );
}

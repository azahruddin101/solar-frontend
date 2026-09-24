'use client';

// Keeps the browser's OneSignal identity in step with the session, and offers the opt-in button.
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pushConfigured, pushEnable, pushLogin, pushLogout, pushPermission } from '@/lib/onesignal';
import { useSession } from '@/lib/session';
import { toast } from '../kit';

export default function PushNotifications() {
  const { user, impersonated } = useSession();
  const [permission, setPermission] = useState('unsupported');
  const userId = user?.id;
  // A super admin viewing a company's workspace must not steal that user's notifications for their own browser.
  const active = pushConfigured && Boolean(userId) && !impersonated && user.role !== 'superadmin';

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPermission(pushPermission()), []);

  useEffect(() => {
    if (!active) return undefined;
    pushLogin(userId); // re-links after a refresh or on a different browser; no-op when already linked, and switches users
    return undefined;
  }, [active, userId]);

  // Sign-out ends the browser's link to the user. (Not on unmount: moving between layouts must not unlink.)
  useEffect(() => useSession.subscribe((s, prev) => {
    if (prev.status === 'ready' && s.status === 'guest') pushLogout();
  }), []);

  if (!active || permission === 'unsupported') return null;

  const enable = async () => {
    const result = await pushEnable();
    setPermission(result);
    if (result === 'granted') toast.success('Notifications are on');
    else if (result === 'denied') toast.error('Notifications are blocked. Allow them in your browser’s site settings.');
  };

  const denied = permission === 'denied';
  const granted = permission === 'granted';
  const Icon = denied ? BellOff : granted ? BellRing : Bell;
  const label = denied ? 'Notifications blocked in browser' : granted ? 'Notifications on' : 'Turn on notifications';
  return (
    <button type="button" onClick={granted || denied ? undefined : enable} disabled={granted} aria-label={label} title={label} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white disabled:cursor-default disabled:hover:bg-transparent">
      <Icon className={granted ? 'h-4 w-4 text-emerald-400' : 'h-4 w-4'} />
    </button>
  );
}

// The only place that talks to the OneSignal Web SDK. Everything is best-effort: if the SDK is blocked,
// unconfigured or throws, the app carries on without push.
const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';
const SAFARI_WEB_ID = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || '';
const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

export const pushConfigured = Boolean(APP_ID);
export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

let ready = null; // one init per page load — re-renders and re-logins reuse it

function load() {
  if (!pushConfigured || typeof window === 'undefined') return Promise.resolve(null);
  ready ||= new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: APP_ID,
          ...(SAFARI_WEB_ID && { safari_web_id: SAFARI_WEB_ID }),
          serviceWorkerPath: 'OneSignalSDKWorkerDefault.js',
          allowLocalhostAsSecureOrigin: true, // local development over http://localhost
          notifyButton: { enable: false }, // we ask on a user click instead
        });
        resolve(OneSignal);
      } catch (e) {
        console.warn('OneSignal could not start:', e?.message || e);
        resolve(null);
      }
    });
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.defer = true;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return ready;
}

const guard = async (fn) => {
  try {
    const OneSignal = await load();
    return OneSignal ? await fn(OneSignal) : undefined;
  } catch (e) {
    console.warn('OneSignal:', e?.message || e);
    return undefined;
  }
};

/** Tie this browser to the signed-in user (external ID = user id). Safe to call repeatedly. */
export const pushLogin = (userId) => guard(async (OneSignal) => {
  if (OneSignal.User.externalId !== String(userId)) await OneSignal.login(String(userId));
});

/** Detach this browser from the user on sign-out. */
export const pushLogout = () => guard(async (OneSignal) => {
  if (OneSignal.User.externalId) await OneSignal.logout();
});

/** 'granted' | 'denied' | 'default' | 'unsupported' — read without prompting. */
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

/** Show the browser prompt (call from a click) and subscribe. Resolves to the resulting permission. */
export async function pushEnable() {
  await guard(async (OneSignal) => {
    await OneSignal.Notifications.requestPermission();
    if (OneSignal.Notifications.permission && !OneSignal.User.PushSubscription.optedIn) await OneSignal.User.PushSubscription.optIn();
  });
  return pushPermission();
}

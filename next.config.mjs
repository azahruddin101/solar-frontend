const isProd = process.env.NODE_ENV === 'production';

// Where the browser may talk to: this site, the API, Google Maps and OneSignal.
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').origin;
  } catch {
    return '';
  }
})();

const csp = [
  "default-src 'self'",
  // Next.js emits small inline bootstrap scripts, so inline scripts stay allowed; everything else is restricted to known hosts
  `script-src 'self' 'unsafe-inline' https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com https://*.googleusercontent.com https://cdn.onesignal.com https://*.onesignal.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: http:", // satellite tiles, uploads and previews come from several hosts
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${apiOrigin} https://*.googleapis.com https://*.google.com https://*.gstatic.com https://onesignal.com https://*.onesignal.com blob: data:`,
  "worker-src 'self' blob: https://cdn.onesignal.com",
  `frame-src 'self' ${apiOrigin} https://onesignal.com https://*.onesignal.com https://*.google.com`,
  "media-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const headers = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // the app uses the camera (photos) and location (site visits); nothing else
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
  ...(isProd
    ? [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ]
    : []), // the dev server needs eval/websockets and LAN hosts, so the CSP is applied to production builds only
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev server may be opened from a phone/laptop on the same network (http://192.168.x.x:3000).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.local'],
  async headers() {
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;

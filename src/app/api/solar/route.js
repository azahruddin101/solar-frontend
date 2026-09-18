// Proxies Google Solar API buildingInsights:findClosest so the key can stay server-side.

const ENDPOINT = 'https://solar.googleapis.com/v1/buildingInsights:findClosest';

function serverKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get('lat'));
  const lng = Number.parseFloat(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: 'Valid lat and lng query parameters are required.' }, { status: 400 });
  }
  const key = serverKey();
  if (!key) {
    return Response.json({ error: 'The server has no Google API key configured (GOOGLE_MAPS_API_KEY).', code: 'NO_KEY' }, { status: 500 });
  }

  const referer = request.headers.get('referer');
  let last = null;
  // Prefer the best imagery; fall back to lower quality where HIGH isn't available.
  for (const quality of ['HIGH', 'MEDIUM', 'LOW']) {
    const params = new URLSearchParams({
      'location.latitude': lat.toFixed(7),
      'location.longitude': lng.toFixed(7),
      requiredQuality: quality,
      key,
    });
    let res;
    try {
      res = await fetch(`${ENDPOINT}?${params}`, { headers: referer ? { Referer: referer } : {}, cache: 'no-store' });
    } catch {
      return Response.json({ error: 'Could not reach the Google Solar API.', code: 'NETWORK' }, { status: 502 });
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      return Response.json(body, { headers: { 'Cache-Control': 'private, max-age=3600' } });
    }
    last = { status: res.status, message: body?.error?.message || res.statusText, code: body?.error?.status || 'ERROR' };
    if (res.status !== 404) break;
  }

  const message =
    last.status === 404
      ? 'Google Solar API has no data for this building yet.'
      : last.status === 403
        ? `Solar API request was denied: ${last.message}`
        : last.message;
  return Response.json({ error: message, code: last.code }, { status: last.status });
}

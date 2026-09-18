// Same-origin proxy for Google Maps Static API images, used as the 3D ground texture and
// in the PDF (a same-origin image keeps the WebGL canvas untainted).

const ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';

function serverKey() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
}

const num = (v) => Number.parseFloat(v);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = num(searchParams.get('lat'));
  const lng = num(searchParams.get('lng'));
  const zoom = Math.round(num(searchParams.get('zoom') ?? '20'));
  const width = Math.min(640, Math.max(64, Math.round(num(searchParams.get('w') ?? '640'))));
  const height = Math.min(640, Math.max(64, Math.round(num(searchParams.get('h') ?? '640'))));
  const maptype = ['satellite', 'hybrid', 'roadmap'].includes(searchParams.get('maptype')) ? searchParams.get('maptype') : 'satellite';

  if (![lat, lng, zoom, width, height].every(Number.isFinite) || zoom < 1 || zoom > 21) {
    return Response.json({ error: 'Invalid parameters.' }, { status: 400 });
  }
  const key = serverKey();
  if (!key) return Response.json({ error: 'No Google API key configured on the server.' }, { status: 500 });

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: '2',
    maptype,
    key,
  });

  // Optional outline: pts=lat,lng;lat,lng;...
  const pts = (searchParams.get('pts') || '')
    .split(';')
    .map((s) => s.split(',').map(num))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .slice(0, 80);
  if (pts.length >= 3) {
    const path = [...pts, pts[0]].map(([a, b]) => `${a.toFixed(7)},${b.toFixed(7)}`).join('|');
    params.append('path', `color:0xf59e0bff|weight:4|fillcolor:0xf59e0b30|${path}`);
  }

  const referer = request.headers.get('referer');
  let res;
  try {
    res = await fetch(`${ENDPOINT}?${params}`, { headers: referer ? { Referer: referer } : {} });
  } catch {
    return Response.json({ error: 'Could not reach Google Static Maps.' }, { status: 502 });
  }
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('image/')) {
    const text = await res.text().catch(() => '');
    return Response.json({ error: text.slice(0, 300) || `Static Maps error ${res.status}` }, { status: res.ok ? 502 : res.status });
  }
  const buf = await res.arrayBuffer();
  return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
}

// Catalog storage: a JSON file on the server (data/catalog.json). Writes need the admin password.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCatalog } from '@/lib/catalog';

const FILE = path.join(process.cwd(), 'data', 'catalog.json');
const password = () => process.env.ADMIN_PASSWORD || 'admin123';

async function read() {
  try {
    return normalizeCatalog(JSON.parse(await fs.readFile(FILE, 'utf8')));
  } catch {
    return normalizeCatalog(null);
  }
}

export async function GET() {
  return Response.json(await read(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  // login check
  const ok = request.headers.get('x-admin-password') === password();
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}

export async function PUT(request) {
  if (request.headers.get('x-admin-password') !== password()) return Response.json({ error: 'Wrong admin password' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  const catalog = normalizeCatalog(body);
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(catalog, null, 2));
  return Response.json(catalog);
}

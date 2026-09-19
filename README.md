# Innovbit — rooftop solar design SaaS

Multi-tenant platform for solar companies: manage clients, design rooftop systems in 3D and send
proposals branded with the company's logo, colours, e-signature and QR code.

- **Frontend** — Next.js (JavaScript, App Router). It has **no API routes**; every server call goes to the backend.
- **Backend** — Node.js + Express + MongoDB (Mongoose) in `backend/`.

New to solar? Read **[docs/SOLAR-GUIDE.md](docs/SOLAR-GUIDE.md)** — every term, part and calculation used in this project, explained from zero.

## Roles
| Role | Signs in | Can do |
| --- | --- | --- |
| Super admin | yes (`/admin`) | Add companies, set plan / client & design limits / features, suspend or delete, reset passwords, open a company's workspace |
| Company | yes (`/dashboard`) | Profile, theme colours, logo, e-signature, QR code, proposal terms, panel & pole catalog, pricing, clients, designs, PDFs |
| Client | no | Name, email, phone and address are managed by the company and printed on their proposal |

## Setup
1. MongoDB running locally (`mongodb://127.0.0.1:27017`).
2. Google Cloud: enable Maps JavaScript API, Places API (New), Geocoding API, Solar API, Maps Static API.
3. Backend: `cd backend && cp .env.example .env`, fill it in, `npm install`.
4. Frontend: `cp .env.example .env.local`, fill in the browser key, `npm install`.
5. Seed: `npm run seed` (adds what is missing) or `npm run seed:fresh` (wipes the database and `backend/uploads` first).
6. Run both: `npm run dev:api` (http://localhost:4000) and `npm run dev` (http://localhost:3000).

Seeded sign-ins: the super admin from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`, and demo companies
`demo@sunrisesolar.in`, `demo@greenvolt.in`, `demo@heliosrooftops.in` (suspended) — password `Demo@12345`.
Demo companies come with a logo, e-signature, QR code, panels, poles, clients and designs.

Production: set `NEXT_PUBLIC_API_URL` at build time, `CORS_ORIGIN` to the site origin, a strong `JWT_SECRET`, and do not seed demo data.

## Backend structure (`backend/src`)
```
server.js            entry: connect MongoDB, ensure super admin, listen
app.js               express app: CORS, JSON, /uploads static, /api routes, error handling
config/              env.js (environment), db.js (mongoose connection)
constants/           roles, plans, statuses, starter catalog
models/              user, company, client, panel, pillar, design
routes/              *.routes.js — URL → controller, mounted in routes/index.js with role guards
controllers/         *.controller.js — read the request, call a service, send the response
services/            *.service.js — business logic (auth, companies, clients, catalog, designs, assets, google)
middlewares/         auth (JWT + roles), upload (multer → backend/uploads), error handler
utils/               HttpError, validators, password (scrypt), token (JWT), pick, png
seeders/             index.js (CLI), superAdmin, demo data + generated brand images
```
Every tenant document carries `company`, and every company query is scoped to the signed-in company.
Uploaded images are stored by multer in `backend/uploads` as `<companyId>-<kind>-<random>.<ext>`.

## Frontend structure (`src`)
- `app/` — `/` landing, `/login`, `/admin/*`, `/dashboard/*`, `/design/[id]/[step]` (designer for a saved design)
- `components/kit` — UI kit · `layout` — app shell, auth guard · `admin`, `dashboard`, `auth`, `marketing`
- `components/steps`, `editor`, `scene`, `map` — the designer (Location → Roof → Solar plan)
- `lib/api.js` (backend client + token), `session.js`, `theme.js` (company colours → CSS variables), `useDesignSync.js` (load + autosave), `pdf.js` + `branding.js` (company/client-customised A4 PDF), `pdfRichText.js` (renders the terms & conditions HTML from the Quill editor — `components/kit/RichTextEditor.js` — into the PDF; the backend sanitises it in `utils/richText.js`)

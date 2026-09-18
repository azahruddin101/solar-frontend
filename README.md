# Rooftop Solar Planner

Next.js (JavaScript) app: search a location → outline the roof on Google satellite map →
Google Solar API roof analysis → procedural 3D house (three.js / react-three-fiber) →
place panels, adjust tilt & facing direction → download a PDF plan (jsPDF).

## Setup
1. In Google Cloud enable: Maps JavaScript API, Places API (New), Geocoding API, Solar API, Maps Static API.
2. `cp .env.example .env.local` and fill in the keys.
3. `npm install && npm run dev` → http://localhost:3000

No key yet? Click "Try the sample building" to explore the 3D designer and PDF.

## Structure
- `src/app/api/solar` – proxy for `buildingInsights:findClosest` (HIGH → MEDIUM → LOW fallback)
- `src/app/api/staticmap` – satellite image proxy (3D ground texture, PDF site image)
- `src/components/map` – search, custom polygon drawing (Drawing Library was removed by Google in 2026), Solar insights
- `src/components/three` – house geometry (flat/gable/hip/shed roofs), instanced panels, sun & shadows
- `src/lib` – geometry, roof model, sun-path/irradiance model, auto layout, finance, PDF

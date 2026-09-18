// Product catalog managed by the admin (/admin): panels priced per piece, pillars per foot.

export const PILLAR_SHAPES = [
  { id: 'l-shape', label: 'L-shape (angle)' },
  { id: 'cylindrical', label: 'Cylindrical (round pipe)' },
  { id: 'square', label: 'Square (box section)' },
];

export const DEFAULT_CATALOG = {
  currency: 'INR',
  otherCostPerKw: 18000, // inverter, wiring, installation etc.
  tariff: 8,
  panels: [
    { id: 'p300', brand: 'Waaree', model: 'WS-300', watts: 300, length: 1.65, width: 0.99, price: 7500 },
    { id: 'p400', brand: 'Tata Power Solar', model: 'TP-400', watts: 400, length: 1.88, width: 1.05, price: 10500 },
    { id: 'p500', brand: 'Adani Solar', model: 'ASM-500', watts: 500, length: 2.19, width: 1.1, price: 13500 },
  ],
  pillars: [
    { id: 'pl-l', name: 'MS angle 50×50×5', shape: 'l-shape', pricePerFt: 95 },
    { id: 'pl-c', name: 'GI round pipe 2"', shape: 'cylindrical', pricePerFt: 140 },
    { id: 'pl-s', name: 'GI square tube 60×60', shape: 'square', pricePerFt: 165 },
  ],
};

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export function normalizeCatalog(raw) {
  const c = { ...DEFAULT_CATALOG, ...(raw || {}) };
  c.otherCostPerKw = Number(c.otherCostPerKw) || 0;
  c.tariff = num(c.tariff, 8);
  c.panels = (Array.isArray(c.panels) ? c.panels : []).map((p, i) => {
    const watts = num(p.watts, 400);
    return {
      id: String(p.id || `p${i}`),
      brand: String(p.brand || '').slice(0, 60),
      model: String(p.model || '').slice(0, 60),
      watts,
      length: num(p.length, 1.9),
      width: num(p.width, 1.05),
      price: Number(p.price) || 0,
      voc: num(p.voc, Math.round((30 + watts * 0.04) * 10) / 10),
      isc: num(p.isc, Math.round((8 + watts * 0.011) * 10) / 10),
      name: `${p.brand || ''} ${p.model || ''} ${watts} W`.trim(),
    };
  });
  c.pillars = (Array.isArray(c.pillars) ? c.pillars : []).map((p, i) => ({
    id: String(p.id || `pl${i}`),
    name: String(p.name || '').slice(0, 60),
    shape: PILLAR_SHAPES.some((s) => s.id === p.shape) ? p.shape : 'square',
    pricePerFt: Number(p.pricePerFt) || 0,
  }));
  if (!c.panels.length) c.panels = normalizeCatalog(DEFAULT_CATALOG).panels;
  if (!c.pillars.length) c.pillars = normalizeCatalog(DEFAULT_CATALOG).pillars;
  return c;
}

// Company theme colours → CSS variables (see globals.css) and PDF colours.

export const DEFAULT_THEME = { primary: '#1d4ed8', accent: '#f59e0b' };
export const THEME_PRESETS = [
  { name: 'Cobalt', primary: '#1d4ed8', accent: '#f59e0b' },
  { name: 'Emerald', primary: '#047857', accent: '#facc15' },
  { name: 'Teal', primary: '#0f766e', accent: '#fb923c' },
  { name: 'Indigo', primary: '#4338ca', accent: '#22d3ee' },
  { name: 'Crimson', primary: '#be123c', accent: '#f59e0b' },
  { name: 'Sunset', primary: '#c2410c', accent: '#0ea5e9' },
  { name: 'Graphite', primary: '#1e293b', accent: '#f59e0b' },
  { name: 'Violet', primary: '#7e22ce', accent: '#34d399' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHex = (v) => HEX.test(v || '');
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text colour on top of `hex`. */
export const foregroundOn = (hex) => (luminance(hex) > 0.45 ? '#0f172a' : '#ffffff');

export function resolveTheme(theme) {
  const primary = isHex(theme?.primary) ? theme.primary : DEFAULT_THEME.primary;
  const accent = isHex(theme?.accent) ? theme.accent : DEFAULT_THEME.accent;
  return { primary, accent, primaryFg: foregroundOn(primary), accentFg: foregroundOn(accent) };
}

export function applyTheme(theme) {
  const t = resolveTheme(theme);
  const s = document.documentElement.style;
  s.setProperty('--brand', t.primary);
  s.setProperty('--brand-fg', t.primaryFg);
  s.setProperty('--accent', t.accent);
  s.setProperty('--accent-fg', t.accentFg);
}

export function clearTheme() {
  const s = document.documentElement.style;
  for (const k of ['--brand', '--brand-fg', '--accent', '--accent-fg']) s.removeProperty(k);
}

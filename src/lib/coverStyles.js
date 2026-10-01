// The front pages a proposal PDF can open with. Only page 1 differs — every other page is the same.
// Drawn by pdfCover.js (magazine) and pdfCoverVariants.js (the rest); picked in the CoverPicker dialog.

export const COVER_STYLES = [
  { id: 'magazine', name: 'Magazine', description: 'Curved photo, script tagline and a wave footer.' },
  { id: 'photo', name: 'Full photo', description: 'The 3D render fills the page top, title on the picture.' },
  { id: 'panel', name: 'Side panel', description: 'A bold brand-coloured column beside the picture.' },
  { id: 'minimal', name: 'Minimal', description: 'Clean white page, large type and a framed picture.' },
];

export const DEFAULT_COVER = COVER_STYLES[0].id;
export const coverStyle = (id) => (COVER_STYLES.some((c) => c.id === id) ? id : DEFAULT_COVER);

const KEY = 'proposal-cover';

/** The cover picked last time on this browser (a convenience only — never required). */
export function lastCover() {
  try {
    return coverStyle(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_COVER;
  }
}

export function rememberCover(id) {
  try {
    window.localStorage.setItem(KEY, coverStyle(id));
  } catch {
    /* private mode or blocked storage: the choice simply is not remembered */
  }
}

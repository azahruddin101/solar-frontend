// Script typeface for the hand-lettered lines on the PDF cover. next/font self-hosts it and registers
// the @font-face; the cover draws it on a canvas (jsPDF's built-in fonts have no script face).
import { Sacramento } from 'next/font/google';

export const scriptFont = Sacramento({ weight: '400', subsets: ['latin'], display: 'swap', preload: false });

/** Resolves to the CSS font-family once the face is ready to be used on a canvas. */
export async function loadScriptFont() {
  const family = scriptFont.style.fontFamily;
  try {
    await document.fonts.load(`64px ${family}`);
  } catch {
    /* falls back to the generic cursive below */
  }
  return `${family}, "Brush Script MT", cursive`;
}

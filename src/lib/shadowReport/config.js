// Shadow report configuration: which seasons and times are analysed, how densely panels are sampled
// and how large the renders are. Season dates come from the shared season table (src/lib/seasons.js)
// so the report and the 3D viewer's Winter / Summer buttons always mean the same day.

import { SEASON_DAYS } from '../seasons.js';
import { dayOfYear } from '../sun.js';

/**
 * @typedef {Object} ReportSeason
 * @property {'winter'|'summer'|'monsoon'} id
 * @property {string} label
 * @property {number} day     day of year the season is represented by
 * @property {string} note    one line for the report
 */

/** @type {ReportSeason[]} */
export const REPORT_SEASONS = [
  { id: 'winter', label: 'Winter', day: SEASON_DAYS.winter, note: 'Winter solstice (21 Dec) — the lowest sun path and the longest shadows of the year' },
  { id: 'summer', label: 'Summer', day: SEASON_DAYS.summer, note: 'Summer solstice (21 Jun) — the highest sun path and the shortest shadows' },
  { id: 'monsoon', label: 'Monsoon', day: dayOfYear(6, 15), note: 'Mid-monsoon (15 Jul) — a high sun path; direct sunlight when the sky is clear' },
];

/** Solar hours analysed in every season (24-hour), displayed as 6:00 AM … 4:00 PM. */
export const REPORT_HOURS = [6, 8, 10, 12, 14, 16];

/**
 * Panel sampling: every module is sampled on a `base` × `base` grid; a module the first pass finds
 * partly shaded is re-sampled on a `refined` × `refined` grid while the per-timestamp ray budget
 * allows, so partial shadows (a tank edge across a panel) get a precise fraction without casting
 * hundreds of rays on panels that are plainly fully lit or fully shaded.
 */
export const SAMPLING = { base: 10, refined: 20, rayBudget: 150000 };

/** Render sizes to try, best first. The report falls back when the GPU cannot allocate the buffer. */
export const RENDER_SIZES = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
];

/** JPEG quality for the renders placed in the PDF (0–1). */
export const IMAGE_QUALITY = 0.92;

/** How the report camera frames the design: a 3/4 aerial view from the south-west, like the viewer opens. */
export const REPORT_CAMERA = { fov: 42, azimuthDeg: -36, elevationDeg: 38, fill: 0.9 };

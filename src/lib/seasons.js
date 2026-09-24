// The representative days and the time labels shared by the 3D sun study and the shadow report.
// Every season date lives here so the viewer, the report and any future study agree on them.

import { MONTHS } from './sun.js';

/** Day of year for each season button in the 3D view: 21 Dec, 21 Jun, 21 Mar. */
export const SEASON_DAYS = { winter: 355, summer: 172, equinox: 80 };

export const todayDoy = () => {
  const d = new Date();
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
};

/** Day of year for a season key; anything else (e.g. 'today') is the current day. */
export const dayFor = (season) => SEASON_DAYS[season] ?? todayDoy();

/** A Date for a day of the year (current year unless given). */
export const dateForDay = (doy, year = new Date().getFullYear()) => new Date(year, 0, doy);

/** "Dec 21" */
export const fmtDay = (doy) => {
  const d = dateForDay(doy);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

/** "2026-12-21" */
export const isoDay = (doy) => {
  const d = dateForDay(doy);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Decimal hour → "6:00 AM" / "12:00 PM" / "2:30 PM". */
export const fmtHour = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
};

/** Decimal hour → "06:00" (24-hour). */
export const fmtHour24 = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

// A design can hold several buildings (a campus). Every roof section belongs to one building; the first
// section of a building is its main roof, the others are raised sections on top of it. Designs made before
// buildings existed have no list: all their sections form one building.

export const FIRST_BUILDING = 'b1';

/** The design's buildings; a design without a list is a single building. */
export const buildingList = (buildings) => (Array.isArray(buildings) && buildings.length ? buildings : [{ id: FIRST_BUILDING, name: 'Building 1' }]);

/** The id of the building a section belongs to (the first building when it names none, or one that is gone). */
export function buildingIdOf(section, buildings) {
  const list = buildingList(buildings);
  return list.some((b) => b.id === section?.building) ? section.building : list[0].id;
}

export const sectionsOf = (sections, buildings, id) => sections.filter((s) => buildingIdOf(s, buildings) === id);
/** A building's main roof: its first section. */
export const mainSection = (sections, buildings, id) => sections.find((s) => buildingIdOf(s, buildings) === id) || null;
export const isMainSection = (sections, buildings, section) => mainSection(sections, buildings, buildingIdOf(section, buildings))?.id === section?.id;

/** Name for the next building: "Building 3". */
export function nextBuildingName(buildings) {
  const names = new Set(buildingList(buildings).map((b) => b.name.toLowerCase()));
  let n = buildingList(buildings).length + 1;
  while (names.has(`building ${n}`)) n++;
  return `Building ${n}`;
}

/** Split `total` over the buildings in proportion to `weights`, to whole units, so the parts add up exactly. */
export function allocate(total, weights) {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (!weights.length) return [];
  if (!(sum > 0)) return weights.map((_, i) => (i === 0 ? Math.round(total) : 0));
  const parts = weights.map((w) => Math.round((total * w) / sum));
  const largest = weights.indexOf(Math.max(...weights));
  parts[largest] += Math.round(total) - parts.reduce((a, p) => a + p, 0); // rounding left-over goes to the biggest share
  return parts;
}

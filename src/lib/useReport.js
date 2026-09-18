'use client';

import { useMemo } from 'react';
import { bounds } from './geometry.js';
import { buildReport } from './report.js';
import { staticMapUrl, zoomForSpan } from './staticMap.js';
import { useStore } from './store.js';

export function useReport(design) {
  const finance = useStore((s) => s.finance);
  const report = useStore((s) => s.report);
  const place = useStore((s) => s.place);
  const snapshot = useStore((s) => s.snapshot);
  const polygon = useStore((s) => s.polygon);

  return useMemo(() => {
    if (!design.roof || !design.origin) return null;
    const r = buildReport({ design, finance, report, place, snapshot });
    const bb = bounds(design.footprint);
    const zoom = zoomForSpan(design.origin.lat, Math.max(bb.width, bb.height, 10), 2.4);
    r.siteImageUrl = staticMapUrl({ lat: design.origin.lat, lng: design.origin.lng, zoom, polygon });
    return r;
  }, [design, finance, report, place, snapshot, polygon]);
}

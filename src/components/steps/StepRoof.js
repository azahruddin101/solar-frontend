'use client';

import { useStore } from '@/lib/store';
import StepDraw from './StepDraw';
import StepSimpleObstacles from './StepSimpleObstacles';

/** Outline first; once the roof exists the same page offers optional roof objects. */
export default function StepRoof({ design }) {
  const hasRoof = useStore((s) => s.sections.length > 0);
  return hasRoof ? <StepSimpleObstacles design={design} /> : <StepDraw design={design} />;
}

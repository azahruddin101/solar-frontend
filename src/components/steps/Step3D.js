'use client';

import { useStore } from '@/lib/store';
import Scene3D from '../scene/Scene3D';
import DesignPanel from './DesignPanel';
import ShadowReportModal from './ShadowReportModal';

export default function Step3D({ design }) {
  // opened from the header's Export menu
  const showShadowReport = useStore((s) => s.shadowReport);

  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[330px]">
        <Scene3D design={design} />
      </div>
      <DesignPanel design={design} />
      <ShadowReportModal open={Boolean(showShadowReport)} mode={showShadowReport || 'report'} onClose={() => useStore.getState().set({ shadowReport: false })} design={design} />
    </>
  );
}

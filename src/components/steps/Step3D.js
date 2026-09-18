'use client';

import Scene3D from '../scene/Scene3D';
import DesignPanel from './DesignPanel';

export default function Step3D({ design }) {
  return (
    <>
      <div className="absolute inset-y-0 left-0 right-[330px]">
        <Scene3D design={design} />
      </div>
      <DesignPanel design={design} />
    </>
  );
}

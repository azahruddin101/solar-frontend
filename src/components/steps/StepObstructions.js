'use client';

import { Box, MousePointer2, TreePine } from 'lucide-react';
import { useStore } from '@/lib/store';
import Editor2D from '../editor/Editor2D';
import { Hint, RoundBtn } from './common';
import ObjectPanel from './ObjectPanel';

export default function StepObstructions({ design }) {
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  const pick = (t) => set({ tool: tool === t ? 'select' : t, selectedId: null });
  return (
    <Editor2D design={design} showPanels={false}>
      <Hint>{tool === 'add-tree' ? 'Click to place a tree, then drag its edge to resize' : tool === 'add-block' ? 'Click to place a water tank / stair room / AC unit' : 'Mark anything that casts shadows or blocks panels — or press Next to skip'}</Hint>
      <div className="absolute left-4 top-4 flex flex-col gap-3">
        <RoundBtn icon={MousePointer2} label="Select / move" active={tool === 'select'} onClick={() => set({ tool: 'select' })} />
        <RoundBtn icon={TreePine} label="Add tree" active={tool === 'add-tree'} onClick={() => pick('add-tree')} />
        <RoundBtn icon={Box} label="Add obstruction (tank, stair room…)" active={tool === 'add-block'} onClick={() => pick('add-block')} />
      </div>
      <ObjectPanel design={design} />
    </Editor2D>
  );
}

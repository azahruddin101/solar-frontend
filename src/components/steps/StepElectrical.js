'use client';

import { Zap } from 'lucide-react';
import { INVERTERS } from '@/lib/electrical';
import { useStore } from '@/lib/store';
import { FormPage, inputCls, Label } from './common';
import { LayoutSvg, SldSvg } from './Drawings';

export const Th = ({ children, r }) => <th className={`px-3 py-2 text-xs font-semibold text-slate-500 ${r ? 'text-right' : 'text-left'}`}>{children}</th>;
export const Td = ({ children, r }) => <td className={`border-t border-slate-100 px-3 py-2 text-sm ${r ? 'text-right tabular-nums' : ''}`}>{children}</td>;

export default function StepElectrical({ design }) {
  const inverterId = useStore((s) => s.electrical.inverterId);
  const patch = useStore((s) => s.patch);
  const el = design.electrical;
  return (
    <FormPage icon={Zap} title="Electrical Design" wide>
      <div>
        <Label>Inverter</Label>
        <select className={inputCls} value={inverterId} onChange={(e) => patch('electrical', { inverterId: e.target.value })}>
          <option value="auto">Auto-select ({el.inverterCount} × {el.inverter?.name})</option>
          {INVERTERS.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <p className="mt-2 text-sm text-slate-500">
          DC {el.kwp.toFixed(2)} kWp / AC {el.acKw} kW · DC:AC ratio {el.dcAc?.toFixed(2)} · string length {el.minLen}–{el.maxLen} modules (max {el.inverter?.maxVdc} V)
        </p>
      </div>
      <div>
        <Label>Auto-stringing</Label>
        <div className="overflow-hidden rounded-2xl border border-slate-200"><LayoutSvg design={design} /></div>
        <table className="mt-3 w-full">
          <thead><tr><Th>String</Th><Th r>Modules</Th><Th r>Power</Th><Th r>Voc (STC)</Th><Th r>Voc (cold)</Th><Th r>Isc</Th><Th r>Inverter</Th></tr></thead>
          <tbody>
            {el.strings.map((s) => (
              <tr key={s.name}>
                <Td><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: s.color }} />{s.name}</Td>
                <Td r>{s.count}</Td><Td r>{s.kwp.toFixed(2)} kWp</Td><Td r>{s.voc.toFixed(0)} V</Td><Td r>{s.vocCold.toFixed(0)} V</Td><Td r>{s.isc} A</Td><Td r>INV-{s.inverter}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Label>Single Line Diagram</Label>
        <div className="overflow-hidden rounded-2xl border border-slate-200 p-2"><SldSvg el={el} spec={design.spec} /></div>
      </div>
      <div>
        <Label>Bill of Materials</Label>
        <table className="w-full">
          <thead><tr><Th>#</Th><Th>Item</Th><Th>Specification</Th><Th r>Qty</Th><Th>Unit</Th></tr></thead>
          <tbody>
            {el.bom.map((b, i) => (
              <tr key={b[0]}><Td>{i + 1}</Td><Td>{b[0]}</Td><Td><span className="text-slate-500">{b[1]}</span></Td><Td r>{b[2]}</Td><Td>{b[3]}</Td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </FormPage>
  );
}

// Strings onto inverter MPPT inputs. Deterministic: the same strings and inverters always give the same result.
//
// Rules:
//  - strings share an MPPT (in parallel) only when they are electrically alike: same module, same number of
//    modules in series and (where practical) the same roof orientation;
//  - an MPPT never takes more strings than its inputs, its max input current (Np × Imp) or its max
//    short-circuit current (Np × Isc), read from the inverter's datasheet;
//  - MPPTs may stay unused, or take a single string;
//  - when the strings cannot be placed, the result is an explicit error, never a forced connection.

/** How many strings like `s` one MPPT of `inv` takes in parallel (0: not even one). */
export function mpptCapacity(inv, s) {
  const byInputs = inv.stringsPerMppt;
  const byImp = Math.floor(inv.maxImpPerMppt / s.imp + 1e-9);
  const byIsc = Math.floor(inv.maxIscPerMppt / s.isc + 1e-9);
  return Math.max(0, Math.min(byInputs, byImp, byIsc));
}

const compatKey = (s, relaxed) => (relaxed ? `${s.moduleKey}|${s.modules}` : `${s.moduleKey}|${s.modules}|${s.orient || '-'}`);

function tryAllocate(strings, inverters, relaxed) {
  const issues = [];
  // groups of strings that may run in parallel, biggest first, then by key (stable)
  const groups = new Map();
  for (const s of strings) {
    const k = compatKey(s, relaxed);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));

  // capacity of one MPPT for each group (the most restrictive inverter, so any MPPT can take a chunk)
  const caps = new Map();
  for (const [k, list] of ordered) {
    const cap = Math.min(...inverters.map((inv) => mpptCapacity(inv.spec, list[0])));
    if (cap < 1) {
      const inv = inverters.find((i) => mpptCapacity(i.spec, list[0]) < 1).spec;
      const why = list[0].imp > inv.maxImpPerMppt ? `string current ${list[0].imp.toFixed(1)} A is above the ${inv.maxImpPerMppt} A MPPT input limit` : `string short-circuit current ${list[0].isc.toFixed(1)} A is above the ${inv.maxIscPerMppt} A MPPT limit`;
      issues.push({ level: 'error', code: 'MPPT_CURRENT', message: `${list.map((s) => s.name).join(', ')}: ${why} of ${inv.name}` });
    }
    caps.set(k, Math.max(1, cap));
  }
  if (issues.length) return { ok: false, issues };

  // spread each group over as many MPPTs as are free (one string per MPPT where possible)
  const totalMppts = inverters.reduce((a, i) => a + i.spec.mppts, 0);
  const nChunks = new Map(ordered.map(([k, list]) => [k, Math.ceil(list.length / caps.get(k))]));
  let spare = totalMppts - [...nChunks.values()].reduce((a, v) => a + v, 0);
  for (let more = true; spare > 0 && more; ) {
    more = false;
    for (const [k, list] of ordered) {
      if (spare > 0 && nChunks.get(k) < list.length) {
        nChunks.set(k, nChunks.get(k) + 1);
        spare--;
        more = true;
      }
    }
  }
  const chunks = [];
  for (const [k, list] of ordered) {
    const c = nChunks.get(k);
    const base = Math.floor(list.length / c);
    let extra = list.length - base * c;
    let i = 0;
    for (let j = 0; j < c; j++) {
      const size = base + (extra-- > 0 ? 1 : 0);
      chunks.push({ key: k, strings: list.slice(i, i + size), power: list.slice(i, i + size).reduce((a, s) => a + s.powerW, 0) });
      i += size;
    }
  }
  chunks.sort((a, b) => b.strings.length - a.strings.length || b.power - a.power || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || a.strings[0].index - b.strings[0].index);

  // inverters with their MPPTs; each chunk goes to the least loaded inverter (DC/AC) with a free MPPT
  const invs = inverters.map((inv) => ({ no: inv.no, spec: inv.spec, loadW: 0, mppts: Array.from({ length: inv.spec.mppts }, (_, j) => ({ no: j + 1, key: null, strings: [] })) }));
  const unplaced = [];
  for (const ch of chunks) {
    const free = invs.filter((inv) => inv.mppts.some((m) => !m.strings.length));
    let target = null;
    if (free.length) {
      const inv = free.reduce((best, x) => ((x.loadW + ch.power) / x.spec.kw < (best.loadW + ch.power) / best.spec.kw - 1e-9 ? x : best));
      target = { inv, m: inv.mppts.find((m) => !m.strings.length) };
    } else {
      // no free MPPT: join an MPPT with the same kind of strings that has room left
      for (const inv of invs) {
        const m = inv.mppts.find((x) => x.key === ch.key && x.strings.length + ch.strings.length <= mpptCapacity(inv.spec, ch.strings[0]));
        if (m) {
          target = { inv, m };
          break;
        }
      }
    }
    if (!target) {
      unplaced.push(ch);
      continue;
    }
    target.m.key = ch.key;
    target.m.strings.push(...ch.strings);
    target.inv.loadW += ch.power;
  }
  if (unplaced.length) {
    const n = unplaced.reduce((a, c) => a + c.strings.length, 0);
    const kinds = new Set(strings.map((s) => compatKey(s, relaxed))).size;
    issues.push({
      level: 'error',
      code: 'MPPT_UNAVAILABLE',
      message: `${n} string${n === 1 ? '' : 's'} (${unplaced.flatMap((c) => c.strings.map((s) => s.name)).join(', ')}) could not be placed: ${strings.length} strings of ${kinds} different kind${kinds === 1 ? '' : 's'} need more MPPT inputs than the ${totalMppts} available. Add an inverter, pick one with more MPPTs, or make the strings the same length.`,
    });
    return { ok: false, issues, invs };
  }
  return { ok: true, issues, invs };
}

/**
 * Place `strings` ({ id, name, index, modules, moduleKey, orient, imp, isc, powerW }) on `inverters` ([{ no, spec }]).
 * Different orientations are kept on separate MPPTs; only when that needs more MPPTs than there are, strings of the
 * same module and length but different orientation may share one (with a warning). Different lengths or modules never do.
 */
export function allocateMppts(strings, inverters) {
  if (!strings.length) return { ok: true, issues: [], inverters: inverters.map((inv) => ({ no: inv.no, spec: inv.spec, loadW: 0, mppts: Array.from({ length: inv.spec.mppts }, (_, j) => ({ no: j + 1, key: null, strings: [] })) })), byString: new Map() };
  if (!inverters.length) return { ok: false, issues: [{ level: 'error', code: 'NO_INVERTER', message: 'No inverter to connect the strings to.' }], inverters: [], byString: new Map() };
  let res = tryAllocate(strings, inverters, false);
  let relaxed = false;
  if (!res.ok && res.issues.every((i) => i.code === 'MPPT_UNAVAILABLE') && new Set(strings.map((s) => s.orient)).size > 1) {
    const r2 = tryAllocate(strings, inverters, true);
    if (r2.ok) {
      res = r2;
      relaxed = true;
      res.issues.push({ level: 'warning', code: 'MPPT_MIXED_ORIENTATION', message: 'Not enough MPPTs to keep every roof orientation separate: some MPPTs combine strings of the same length facing different directions. Their mismatch losses are not modelled.' });
    }
  }
  const byString = new Map();
  for (const inv of res.invs || []) for (const m of inv.mppts) for (const s of m.strings) byString.set(s.id, { inverter: inv.no, mppt: m.no });
  return { ok: res.ok, relaxed, issues: res.issues, inverters: res.invs || [], byString };
}

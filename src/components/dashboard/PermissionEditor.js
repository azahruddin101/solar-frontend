'use client';

// Picking staff permissions: one coloured row per area, one toggle per action. Ticking any action ticks View too (the
// API applies the same rule), and View stays on while anything else in the row is on. Permissions a person already
// gets from a role (`inherited`) show as ticked and locked, so the extra grants on their account stay readable.
import { Check, CircleCheck, ClipboardList, Lock } from 'lucide-react';
import { PERMISSION_CATALOG, normalizePermissions, permissionKey } from '@/lib/permissions';
import { AREA_STYLE, PLAIN } from '@/lib/permissionStyles';
import { cx } from '../kit';

const PRESETS = [
  { id: 'none', label: 'No access' },
  { id: 'view', label: 'Only look' },
  { id: 'all', label: 'Everything' },
];

/** The coloured square icon of an area. */
export function AreaIcon({ area, size = 'md' }) {
  const s = AREA_STYLE[area];
  const Icon = s.icon;
  return (
    <span className={cx('grid shrink-0 place-items-center rounded-lg', s.chip, size === 'sm' ? 'h-6 w-6' : 'h-9 w-9')}>
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-[18px] w-[18px]'} />
    </span>
  );
}

export function PermissionEditor({ value, onChange, inherited = [], disabled = false }) {
  const has = (p) => value.includes(p);
  const fromRole = (p) => inherited.includes(p);

  const toggle = (area, action) => {
    const p = permissionKey(area, action);
    const view = permissionKey(area, 'view');
    if (has(p)) {
      // switching View off clears the row: nothing else in it works without View
      const drop = action === 'view' ? Object.keys(PERMISSION_CATALOG[area].actions).map((a) => permissionKey(area, a)) : [p];
      onChange(value.filter((x) => !drop.includes(x)));
    } else {
      onChange(normalizePermissions([...value, p, view]));
    }
  };

  const preset = (area, id) => {
    const keys = Object.keys(PERMISSION_CATALOG[area].actions).map((a) => permissionKey(area, a));
    const rest = value.filter((p) => !keys.includes(p));
    if (id === 'none') onChange(rest);
    if (id === 'view') onChange(normalizePermissions([...rest, permissionKey(area, 'view')]));
    if (id === 'all') onChange(normalizePermissions([...rest, ...keys]));
  };

  return (
    <div className="space-y-2.5">
      {Object.entries(PERMISSION_CATALOG).map(([area, a]) => {
        const style = AREA_STYLE[area];
        const actions = Object.entries(a.actions);
        const rowOn = actions.some(([action]) => has(permissionKey(area, action)) || fromRole(permissionKey(area, action)));
        const viewLocked = actions.some(([action]) => action !== 'view' && has(permissionKey(area, action)));
        return (
          <div key={area} className={cx('rounded-xl border border-l-4 border-slate-200 p-3.5 transition-colors', style.bar, rowOn ? style.soft : 'bg-white')}>
            <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <AreaIcon area={area} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{a.label}</div>
                  <div className="text-xs leading-snug text-slate-500">{a.description}</div>
                </div>
              </div>
              {!disabled && (
                <div className="flex shrink-0 gap-0.5 rounded-lg bg-white/80 p-0.5 ring-1 ring-slate-200" role="group" aria-label={`${a.label}: quick choice`}>
                  {PRESETS.map((p) => (
                    <button key={p.id} type="button" onClick={() => preset(area, p.id)} className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {actions.map(([action, label]) => {
                const p = permissionKey(area, action);
                const inheritedOn = fromRole(p);
                const on = has(p) || inheritedOn;
                const locked = disabled || inheritedOn || (action === 'view' && viewLocked);
                const title = inheritedOn ? 'Already given by a role' : action === 'view' && viewLocked ? 'Needed for the other choices in this row' : PLAIN[area]?.[action];
                return (
                  <button
                    key={action}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${a.label} — ${label}`}
                    title={title}
                    disabled={locked}
                    onClick={() => toggle(area, action)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                      inheritedOn ? 'border-slate-300 bg-slate-100 text-slate-500' : on ? style.on : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
                      locked && 'cursor-default',
                    )}
                  >
                    {inheritedOn ? <Lock className="h-3 w-3" /> : on ? <Check className="h-3 w-3" /> : null}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Read-only, in everyday words: what a permission list lets someone do, one coloured block per area.
 * `ownTasks` adds the line every staff member has (their own installation tasks).
 */
export function PermissionSummary({ permissions, ownTasks = false, empty = 'Nothing yet.', columns = false }) {
  const rows = Object.keys(PERMISSION_CATALOG)
    .map((area) => ({ area, can: Object.keys(PERMISSION_CATALOG[area].actions).filter((a) => permissions?.includes(permissionKey(area, a))).map((a) => PLAIN[area][a]) }))
    .filter((r) => r.can.length);
  return (
    <div className={columns ? 'grid items-start gap-2 sm:grid-cols-2 2xl:grid-cols-3' : 'space-y-2'}>
      {ownTasks && (
        <div className="flex items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><ClipboardList className="h-3.5 w-3.5" /></span>
          <div className="text-sm text-slate-700">Do the installation tasks given to them</div>
        </div>
      )}
      {rows.map((r) => (
        <div key={r.area} className="flex items-start gap-2.5 rounded-lg bg-white/70 px-3 py-2">
          <AreaIcon area={r.area} size="sm" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900">{PERMISSION_CATALOG[r.area].label}</div>
            <ul className="mt-0.5 space-y-0.5">
              {r.can.map((c) => <li key={c} className="flex items-start gap-1.5 text-[13px] text-slate-600"><CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{c}</li>)}
            </ul>
          </div>
        </div>
      ))}
      {!ownTasks && !rows.length && <p className="text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

/** The areas a permission list touches, as small coloured pills ("Leads", "Finances"). */
export function AreaPills({ permissions, empty = null }) {
  const areas = Object.keys(PERMISSION_CATALOG).filter((area) => Object.keys(PERMISSION_CATALOG[area].actions).some((a) => permissions?.includes(permissionKey(area, a))));
  if (!areas.length) return empty;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {areas.map((area) => {
        const Icon = AREA_STYLE[area].icon;
        return (
          <span key={area} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', AREA_STYLE[area].pill)}>
            <Icon className="h-3 w-3" />
            {PERMISSION_CATALOG[area].label}
          </span>
        );
      })}
    </span>
  );
}

/** Short list of the areas a permission list touches ("Finances, Clients"), for plain text. */
export const areasOf = (permissions) => Object.entries(PERMISSION_CATALOG).filter(([area, a]) => Object.keys(a.actions).some((x) => permissions?.includes(permissionKey(area, x)))).map(([, a]) => a.label);

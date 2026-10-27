'use client';

import { ChevronDown, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, cx, DateRangeFilter, FormField, Input } from '../kit';

const DEFAULT_PLACEHOLDER = 'Search name, phone, assigned to, status or date (e.g. 16/10/2026)';

/** Search row + collapsible filter panel (same on All leads, Meta, Google Ads and Manual). */
export default function LeadListFilterBar({
  search,
  onSearchChange,
  placeholder = DEFAULT_PLACEHOLDER,
  activeFilterCount = 0,
  showClear = false,
  onClear,
  fromDate = '',
  toDate = '',
  onDateChange,
  dateLabel = 'Received',
  children,
  className,
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className={cx('mb-4 overflow-hidden p-0', className)}>
      <div className="flex items-stretch border-b border-slate-200">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Search leads"
            placeholder={placeholder}
            value={search}
            onValue={onSearchChange}
            className="rounded-none border-0 pl-9 shadow-none focus:ring-0"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cx(
            'inline-flex shrink-0 items-center gap-2 border-l border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50',
            open && 'bg-slate-50',
          )}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>
          )}
          <ChevronDown className={cx('h-4 w-4 transition', open && 'rotate-180')} />
        </button>
      </div>
      <div className={cx('grid transition-[grid-template-rows] duration-200', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="space-y-4 border-b border-slate-200 bg-slate-50/80 p-4">
            {children && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>}
            {(onDateChange || showClear) && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                {onDateChange && (
                  <FormField label={dateLabel} className="mb-0">
                    <DateRangeFilter from={fromDate} to={toDate} onChange={onDateChange} />
                  </FormField>
                )}
                {showClear && onClear && (
                  <Button type="button" variant="ghost" size="sm" icon={X} onClick={onClear} className="shrink-0">
                    Clear all filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

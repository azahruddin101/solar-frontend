'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/leads/api';
import { UserPlus, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from '@/components/kit';

const PAGE_SIZE = 50;
const MAX_SELECTION = 500;

// Assign Meta leads to a telecaller: pick the telecaller, tick the leads, click Assign.
// The selection is kept while searching, filtering and moving between pages.
const MetaLeadAssignModal = ({
  telecallers,
  onClose,
  onAssigned,
  listUrl = '/company/integrations/meta/leads',
  assignUrl = '/company/integrations/meta/leads/assign',
}) => {
  const [telecallerId, setTelecallerId] = useState('');
  // Which leads to choose from: 'unassigned', '' (all leads) or a telecaller's ID (to reassign their leads)
  const [source, setSource] = useState('unassigned');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const latestRequest = useRef(0);

  const activeTelecallers = telecallers.filter((tc) => tc.status === 'active');
  const unassigning = telecallerId === 'unassign';

  // Debounce typing in the search box
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    fetchLeads();
  }, [source, search, page]);

  const fetchLeads = async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (source) params.assignedTo = source;
      if (search) params.search = search;

      const response = await api.get(listUrl, { params });
      if (requestId !== latestRequest.current) return;

      setLeads(response.data.leads);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (error) {
      if (requestId === latestRequest.current) toast.error('Failed to load leads');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  };

  // A lead that already belongs to the chosen telecaller (or has no owner when unassigning) cannot be picked
  const isSelectable = (lead) => {
    const ownerId = lead.assignedTo?._id || '';
    if (unassigning) return Boolean(ownerId);
    return !telecallerId || ownerId !== telecallerId;
  };

  const selectableOnPage = leads.filter(isSelectable).map((l) => l._id);
  const allOnPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => selectedIds.includes(id));

  const toggleLead = (id) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= MAX_SELECTION) {
        toast.error(`You can assign up to ${MAX_SELECTION} leads at a time`);
        return current;
      }
      return [...current, id];
    });
  };

  const toggleAllOnPage = () => {
    setSelectedIds((current) => {
      if (allOnPageSelected) return current.filter((id) => !selectableOnPage.includes(id));
      const merged = [...new Set([...current, ...selectableOnPage])];
      if (merged.length > MAX_SELECTION) {
        toast.error(`You can assign up to ${MAX_SELECTION} leads at a time`);
        return merged.slice(0, MAX_SELECTION);
      }
      return merged;
    });
  };

  const handleTelecallerChange = (e) => {
    setTelecallerId(e.target.value);
    setSelectedIds([]); // which leads can be picked depends on the telecaller
  };

  const handleSourceChange = (e) => {
    setSource(e.target.value);
    setPage(1);
  };

  const handleAssign = async () => {
    setAssigning(true);
    try {
      const response = await api.post(assignUrl, {
        leadIds: selectedIds,
        telecallerId: unassigning ? null : telecallerId,
      });
      toast.success(response.data.message);
      onAssigned();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign leads');
      setAssigning(false);
    }
  };

  const chosenTelecaller = activeTelecallers.find((tc) => tc._id === telecallerId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl animate-fade-in flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" /> Assign Leads
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {/* 1. Telecaller */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">1. Select staff member</label>
            <select value={telecallerId} onChange={handleTelecallerChange} className="input-field">
              <option value="">Choose a staff member…</option>
              {activeTelecallers.map((tc) => (
                <option key={tc._id} value={tc._id}>{tc.name}</option>
              ))}
              <option value="unassign">Remove assignment (unassign leads)</option>
            </select>
            {activeTelecallers.length === 0 && (
              <p className="text-[11px] text-amber-700 font-semibold mt-1">Nobody can take leads yet. Give a staff member a role with Leads access under Staff Management.</p>
            )}
          </div>

          {/* 2. Leads */}
          <div className={telecallerId ? '' : 'opacity-50 pointer-events-none'}>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">2. Select Leads</label>

            <div className="flex flex-col sm:flex-row gap-3 mb-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4.5 w-4.5 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name, phone, email..."
                  className="input-field pl-10 py-2"
                />
              </div>
              <select value={source} onChange={handleSourceChange} className="input-field py-2 sm:max-w-[220px]">
                <option value="unassigned">Unassigned leads</option>
                <option value="">All leads</option>
                {telecallers.map((tc) => (
                  <option key={tc._id} value={tc._id}>Leads with {tc.name}</option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {/* Select all on this page */}
              <label className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAllOnPage}
                  disabled={selectableOnPage.length === 0}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Select all on this page ({selectableOnPage.length})
                </span>
              </label>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : leads.length > 0 ? (
                <div className="divide-y divide-slate-100 max-h-[38vh] overflow-y-auto custom-scrollbar">
                  {leads.map((lead) => {
                    const selectable = isSelectable(lead);
                    const contact = [lead.phone, lead.email].filter(Boolean).join(' | ');
                    return (
                      <label
                        key={lead._id}
                        className={`flex items-center gap-3 px-4 py-2.5 ${selectable ? 'cursor-pointer hover:bg-slate-50/50' : 'opacity-50'} ${
                          selectedIds.includes(lead._id) ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(lead._id)}
                          onChange={() => toggleLead(lead._id)}
                          disabled={!selectable}
                          className="w-4 h-4 accent-blue-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{lead.fullName || lead.name || 'Lead'}</p>
                          <p className="text-[11px] text-slate-500 font-semibold truncate">
                            {contact || lead.formName || lead.formId}
                            {contact && lead.formName ? ` | ${lead.formName}` : ''}
                          </p>
                        </div>
                        <span className={`text-[11px] font-bold shrink-0 ${lead.assignedTo ? 'text-slate-600' : 'text-slate-500'}`}>
                          {lead.assignedTo
                            ? selectable
                              ? `With ${lead.assignedTo.name}`
                              : `Already with ${lead.assignedTo.name}`
                            : 'Unallocated'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 font-semibold py-10 text-center">
                  {source === 'unassigned' && !search ? 'Every lead is already assigned. Choose "All leads" to reassign.' : 'No leads found'}
                </p>
              )}

              {/* Pagination */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-slate-100">
                <p className="text-[11px] text-slate-500 font-semibold">
                  {total} lead(s) | Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1 || loading}
                    className="px-2 py-1 bg-slate-900/10 text-slate-800 hover:bg-slate-900/20 rounded font-bold text-[11px] uppercase flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages || loading}
                    className="px-2 py-1 bg-slate-900/10 text-slate-800 hover:bg-slate-900/20 rounded font-bold text-[11px] uppercase flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Assign */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <p className="text-xs font-bold text-slate-700">
            {selectedIds.length} lead(s) selected
            {selectedIds.length > 0 && (
              <button onClick={() => setSelectedIds([])} className="ml-2 text-[11px] font-bold text-slate-500 hover:text-blue-600 underline">
                Clear
              </button>
            )}
          </p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn-outline px-4 py-2 border-slate-200 text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={assigning || !telecallerId || selectedIds.length === 0}
              className="btn-primary px-4 py-2 disabled:opacity-60"
            >
              <UserPlus className="w-4 h-4" />
              {assigning
                ? 'Assigning...'
                : unassigning
                  ? `Unassign ${selectedIds.length || ''} Lead(s)`
                  : `Assign ${selectedIds.length || ''} Lead(s)${chosenTelecaller ? ` to ${chosenTelecaller.name}` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetaLeadAssignModal;

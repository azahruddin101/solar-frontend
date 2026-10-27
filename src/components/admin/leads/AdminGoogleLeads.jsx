'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/leads/api';
import { can } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import ExportAllLeadsButton from '@/components/admin/leads/ExportAllLeadsButton';
import ConvertToClient from '@/components/leads/ConvertToClient';
import { useRouter } from 'next/navigation';
import LeadLog from '@/components/leads/LeadLog';
import { Eye, X, ChevronLeft, ChevronRight, ChevronDown, UserPlus, ListChecks, Lock, MoreVertical, Users } from 'lucide-react';
import LeadListFilterBar from '@/components/leads/LeadListFilterBar';
import { toast, FormField, Select } from '@/components/kit';
import MetaLeadAssignModal from '@/components/admin/leads/MetaLeadAssignModal';
import QuickAssign from '@/components/leads/QuickAssign';
import PriorityToggle, { PRIORITY_FILTER_OPTIONS } from '@/components/admin/leads/PriorityToggle';
import { statusBadgeClass, formatFieldLabel, formatFieldValue, isHiddenLeadField } from '@/lib/leads/metaLeadStatus';
import { isLeadStatusLocked, LEAD_CONVERTED_LOCK_HINT } from '@/lib/leads';

const PAGE_SIZES = [20, 50, 100];

// Google Ads lead form leads. Same layout and behaviour as the Meta Leads page,
// with its own data (kept separate from Meta leads).
export default function AdminGoogleLeads() {
  // what the signed-in user may do (owner: everything; staff: their Leads permissions — the API enforces the same)
  const me = useSession((s) => s.user);
  const router = useRouter();
  const canAddClient = can(me, 'clients', 'create');
  const isOwner = me?.role === 'company';
  const may = {
    all: can(me, 'leads', 'view_all'),
    status: can(me, 'leads', 'change_status'),
    priority: can(me, 'leads', 'update'),
    assign: can(me, 'leads', 'assign'),
    export: can(me, 'leads', 'export'),
  };
  const [leads, setLeads] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [telecallers, setTelecallers] = useState([]);
  const [statuses, setStatuses] = useState([]);

  // Filters (applied on the server)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [quickAssign, setQuickAssign] = useState(false);

  const [selectedLead, setSelectedLead] = useState(null);
  const [modalAssigneeId, setModalAssigneeId] = useState('');
  const [modalAssigning, setModalAssigning] = useState(false);
  const [statusForm, setStatusForm] = useState({ statusId: '', remark: '' });
  const [savingStatus, setSavingStatus] = useState(false);
  const [converting, setConverting] = useState(null); // the lead being turned into a client (converted status)
  const [actionsOpen, setActionsOpen] = useState(false);
  const [priorityBusy, setPriorityBusy] = useState('');
  const actionsRef = useRef(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    fetchTelecallers();
    fetchStatuses();
  }, []);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const close = (event) => {
      if (!actionsRef.current?.contains(event.target)) setActionsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [actionsOpen]);

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
  }, [search, assignedTo, statusId, priority, fromDate, toDate, page, pageSize]);

  // staff a lead can be given to (only needed, and only allowed, with Leads › Assign)
  const fetchTelecallers = async () => {
    if (!may.all && !may.assign) return;
    try {
      const response = await api.get('/leads/assignees');
      setTelecallers(response.data);
    } catch (e) {}
  };

  const fetchStatuses = async () => {
    try {
      const response = await api.get('/leads/statuses');
      setStatuses(response.data);
    } catch (e) {}
  };

  const fetchLeads = async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    try {
      const params = { page, limit: pageSize };
      if (search) params.search = search;
      if (assignedTo) params.assignedTo = assignedTo;
      if (statusId) params.statusId = statusId;
      if (priority) params.priority = priority;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const response = await api.get('/leads/google', { params });
      if (requestId !== latestRequest.current) return;
      setLeads(response.data.leads);
      setTotal(response.data.total);
      setTotalPages(response.data.totalPages);
    } catch (e) {
      if (requestId === latestRequest.current) toast.error('Could not load Google Ads leads');
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setAssignedTo('');
    setStatusId('');
    setPriority('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const togglePriority = async (lead) => {
    const next = !lead.isPriority;
    const apply = (value) => {
      setLeads((current) => current.map((item) => (item._id === lead._id ? { ...item, isPriority: value } : item)));
      setSelectedLead((current) => (current && current._id === lead._id ? { ...current, isPriority: value } : current));
    };
    setPriorityBusy(lead._id);
    apply(next);
    try {
      await api.put(`/leads/google/${lead._id}/priority`, { isPriority: next });
      toast.success(next ? 'Marked as priority' : 'Priority removed');
      // The lead may no longer match the priority filter
      if (priority) fetchLeads();
    } catch (error) {
      apply(!next);
      toast.error(error.response?.data?.message || 'Failed to update priority');
    } finally {
      setPriorityBusy('');
    }
  };

  const handleViewLead = (lead) => {
    setSelectedLead(lead);
    setModalAssigneeId('');
    setStatusForm({ statusId: lead.currentStatus?._id || '', remark: '' });
  };

  const handleAssigned = () => {
    setIsAssignOpen(false);
    setSelectedLead(null);
    fetchLeads();
  };

  const handleAssignFromModal = async () => {
    if (!selectedLead || !modalAssigneeId) return;
    setModalAssigning(true);
    try {
      const unassign = modalAssigneeId === 'unassign';
      const response = await api.post('/leads/google/assign', {
        leadIds: [selectedLead._id],
        counsellorId: unassign ? null : modalAssigneeId,
      });
      toast.success(response.data.message);
      setModalAssigneeId('');
      setSelectedLead(null);
      fetchLeads();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not assign lead');
    } finally {
      setModalAssigning(false);
    }
  };

  const handleStatusSave = async () => {
    if (!selectedLead || !statusForm.statusId) return;
    setSavingStatus(true);
    try {
      const chosen = statuses.find((s) => s._id === statusForm.statusId);
      await api.put(`/leads/google/${selectedLead._id}/status`, statusForm);
      toast.success('Status updated');
      // the converted status: add the lead as a client straight away, filled in from the lead
      if (chosen?.outcome === 'converted' && !selectedLead.convertedClient) {
        if (canAddClient) setConverting({ source: 'google', id: selectedLead._id, name: selectedLead.fullName, phone: selectedLead.phone, email: selectedLead.email, address: '' });
        else toast.success('Converted — ask someone who can add clients to add them as a client.');
      }
      setSelectedLead(null);
      fetchLeads();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update status');
    } finally {
      setSavingStatus(false);
    }
  };

  const extraFilterCount = [assignedTo, statusId, priority, fromDate, toDate].filter(Boolean).length;
  const hasFilters = Boolean(searchInput || extraFilterCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
             Google Ads Leads
          </h2>
          <p className="text-sm text-slate-900 mt-1">{may.all ? 'Leads collected from Google Ads lead forms. Assign them to your team and track their progress.' : 'The Google Ads leads assigned to you.'}</p>
        </div>
        <div className="hidden md:flex flex-wrap items-center justify-end gap-2">
          {may.assign && (
            <button onClick={() => setIsAssignOpen(true)} className="btn-primary rounded-md text-base flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> Assign Leads
            </button>
          )}
          {may.assign && (
            <button onClick={() => setQuickAssign(true)} className="btn-outline rounded-md text-base flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Assign by count
            </button>
          )}
          {isOwner && (
            <button onClick={() => router.push('/dashboard/masters?tab=lead-statuses')} className="btn-outline rounded-md text-base flex items-center gap-1.5">
              <ListChecks className="w-4 h-4" /> Statuses
            </button>
          )}
          {may.export && <ExportAllLeadsButton className="rounded-md text-base" />}
        </div>
        {(may.assign || may.export || isOwner) && <div className="relative shrink-0 md:hidden" ref={actionsRef}>
          <button
            type="button"
            aria-label="Lead actions"
            aria-expanded={actionsOpen}
            onClick={() => setActionsOpen((open) => !open)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {may.assign && (
                <button
                  type="button"
                  onClick={() => { setIsAssignOpen(true); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <UserPlus className="w-4 h-4" /> Assign Leads
                </button>
              )}
              {may.assign && (
                <button
                  type="button"
                  onClick={() => { setQuickAssign(true); setActionsOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <Users className="w-4 h-4" /> Assign by count
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => { setActionsOpen(false); router.push('/dashboard/masters?tab=lead-statuses'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  <ListChecks className="w-4 h-4" /> Statuses
                </button>
              )}
              {may.export && <ExportAllLeadsButton plain onOpen={() => setActionsOpen(false)} />}
            </div>
          )}
        </div>}
      </div>

      <LeadListFilterBar
        search={searchInput}
        onSearchChange={setSearchInput}
        activeFilterCount={extraFilterCount}
        showClear={hasFilters}
        onClear={clearFilters}
        fromDate={fromDate}
        toDate={toDate}
        onDateChange={({ from, to }) => {
          setFromDate(from);
          setToDate(to);
          setPage(1);
        }}
      >
        {may.all && (
          <FormField label="Assigned to">
            <Select aria-label="Assigned to" value={assignedTo} onValue={(v) => { setAssignedTo(v); setPage(1); }}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {telecallers.map((tc) => <option key={tc._id} value={tc._id}>{tc.name}</option>)}
            </Select>
          </FormField>
        )}
        <FormField label="Status">
          <Select aria-label="Status" value={statusId} onValue={(v) => { setStatusId(v); setPage(1); }}>
            <option value="">Any status</option>
            <option value="none">Not started</option>
            {statuses.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Priority">
          <Select aria-label="Priority" value={priority} onValue={(v) => { setPriority(v); setPage(1); }}>
            {PRIORITY_FILTER_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </Select>
        </FormField>
      </LeadListFilterBar>

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm border-collapse">
              <thead className="brand-header">
                <tr className="font-semibold uppercase text-[11px] tracking-wide">
                  <th className="p-4 whitespace-nowrap">Lead</th>
                  <th className="p-4 whitespace-nowrap min-w-[240px]">Lead Form</th>
                  <th className="p-4 whitespace-nowrap">Assigned to</th>
                  <th className="p-4 whitespace-nowrap">Status</th>
                  <th className="p-4 whitespace-nowrap">Received</th>
                  <th className="p-4 text-center whitespace-nowrap">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {leads.length > 0 ? (
                  leads.map((l) => {
                    const contact = [l.phone, l.email].filter(Boolean).join(' | ');
                    return (
                      <tr key={l._id} className={l.isPriority ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/50'}>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <PriorityToggle active={l.isPriority} disabled={!may.priority || priorityBusy === l._id} onToggle={() => togglePriority(l)} />
                            <div>
                              <p className="font-bold text-slate-900 leading-tight capitalize">
                                {l.fullName || 'Google Ads Lead'}
                                {l.isTest && <span className="ml-2 text-[11px] font-semibold uppercase text-amber-700">test</span>}
                              </p>
                              <p className="text-xs text-slate-900 font-medium mt-0.5">
                                {contact || `${Object.keys(l.fields || {}).length} answer(s)`}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 min-w-[240px]">
                          <p className="font-semibold text-slate-900 whitespace-nowrap">{l.formName}</p>
                          <p className="text-xs text-slate-900 font-medium mt-0.5 whitespace-nowrap">{l.campaignName || '-'}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-slate-900 capitalize">{l.assignedTo?.name || 'Unallocated'}</p>
                        </td>
                        <td className="p-4">
                          {l.currentStatus ? (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] uppercase font-semibold tracking-wide ${statusBadgeClass(l.currentStatus.color)}`}>
                              {l.currentStatus.name}
                            </span>
                          ) : (
                            <span className="text-slate-900 font-semibold text-sm">{l.assignedTo ? 'Not started' : '-'}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-slate-900">
                            {new Date(l.leadCreatedAt || l.createdAt).toLocaleString()}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => handleViewLead(l)}
                              className="btn-outline !h-8 !px-2.5 text-xs"
                            >
                              <Eye className="w-4 h-4" /> View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-semibold">
                      {hasFilters ? 'No Google Ads leads match these filters' : 'No Google Ads leads received yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500 font-semibold">
              {total} lead(s) | Page {page} of {totalPages}
            </p>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="input-field !h-8 !w-auto text-xs"
              title="Leads per page"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} per page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1 || loading}
              className="btn-outline !h-8 !px-2.5 text-xs cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || loading}
              className="btn-outline !h-8 !px-2.5 text-xs cursor-pointer disabled:opacity-40"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* LEAD DETAILS MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-sm w-full max-w-5xl max-h-[88vh] overflow-hidden shadow-xl animate-fade-in flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
                  <Megaphone className="w-5 h-5 text-blue-600 shrink-0" /> <span className="truncate">{selectedLead.fullName || 'Google Ads Lead'}</span>
                </h3>
                <PriorityToggle withLabel active={selectedLead.isPriority} disabled={!may.priority || priorityBusy === selectedLead._id} onToggle={() => togglePriority(selectedLead)} />
              </div>
              <button onClick={() => setSelectedLead(null)} className="text-slate-500 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                    {Object.entries(selectedLead.fields || {})
                      .filter(([key]) => !isHiddenLeadField(key))
                      .map(([key, value]) => (
                        <div key={key} className="min-w-0">
                          <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-1">{formatFieldLabel(key)}</p>
                          <p className="text-sm text-slate-900 break-words">{formatFieldValue(value) || '-'}</p>
                        </div>
                      ))}
                  </div>

                  {may.assign && isLeadStatusLocked(selectedLead, statuses) && (
                    <p className="p-3 text-xs text-slate-600">{LEAD_CONVERTED_LOCK_HINT}</p>
                  )}
                  {may.assign && !isLeadStatusLocked(selectedLead, statuses) && <div className="p-3 bg-amber-50">
                    <label className="block text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">
                      {selectedLead.assignedTo ? `Reassign (currently with ${selectedLead.assignedTo.name})` : 'Assign to'}
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={modalAssigneeId}
                        onChange={(e) => setModalAssigneeId(e.target.value)}
                        className="input-field py-2 bg-white flex-1 min-w-0"
                      >
                        <option value="">Select a staff member…</option>
                        {telecallers
                          .filter((tc) => tc.status === 'active' && tc._id !== selectedLead.assignedTo?._id)
                          .map((tc) => (
                            <option key={tc._id} value={tc._id}>{tc.name}</option>
                          ))}
                        {selectedLead.assignedTo && <option value="unassign">Remove assignment</option>}
                      </select>
                      <button
                        onClick={handleAssignFromModal}
                        disabled={modalAssigning || !modalAssigneeId}
                        className="btn-primary px-4 py-2 shrink-0 disabled:opacity-60"
                      >
                        <UserPlus className="w-4 h-4" /> {modalAssigning ? 'Assigning...' : 'Assign'}
                      </button>
                    </div>
                  </div>}

                  {may.status && isLeadStatusLocked(selectedLead, statuses) && (
                    <p className="p-3 text-xs text-slate-600">{LEAD_CONVERTED_LOCK_HINT}</p>
                  )}
                  {may.status && !isLeadStatusLocked(selectedLead, statuses) && <div className="p-3 bg-emerald-50 space-y-3">
                    <label className="block text-xs font-semibold text-emerald-800 uppercase tracking-wide">Lead status</label>
                    <select
                      value={statusForm.statusId}
                      onChange={(e) => setStatusForm({ ...statusForm, statusId: e.target.value })}
                      className="input-field py-2 bg-white"
                    >
                      <option value="">Select status</option>
                      {statuses.map((status) => (
                        <option key={status._id} value={status._id}>{status.name}</option>
                      ))}
                    </select>
                    <textarea
                      value={statusForm.remark}
                      onChange={(e) => setStatusForm({ ...statusForm, remark: e.target.value })}
                      placeholder="Remark"
                      rows="2"
                      maxLength={1000}
                      className="input-field py-2 bg-white resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleStatusSave}
                      disabled={savingStatus || !statusForm.statusId}
                      className="btn-primary px-4 py-2 disabled:opacity-60"
                    >
                      {savingStatus ? 'Saving...' : 'Update status'}
                    </button>
                  </div>}
                </div>

                <LeadLog
                  className="self-start md:sticky md:top-0"
                  entries={[
                    { at: selectedLead.createdAt, title: 'Received from Google Ads' },
                    selectedLead.assignedTo && { at: selectedLead.assignedAt, title: `Assigned to ${selectedLead.assignedTo.name}` },
                    selectedLead.convertedClient && { at: selectedLead.convertedAt, title: `Converted to client ${selectedLead.convertedClientName}`, by: selectedLead.convertedByName },
                    ...(selectedLead.statusHistory || []).map((h) => ({ at: h.changedAt, title: 'Status changed', status: { name: h.statusName, color: h.statusColor }, remark: h.remark })),
                  ]}
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                onClick={() => setSelectedLead(null)}
                className="btn-outline px-4 py-2 border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {isAssignOpen && (
        <MetaLeadAssignModal
          telecallers={telecallers}
          onClose={() => setIsAssignOpen(false)}
          onAssigned={handleAssigned}
          listUrl="/leads/google"
          assignUrl="/leads/google/assign"
        />
      )}
      {quickAssign && <QuickAssign source="google" onClose={() => setQuickAssign(false)} onAssigned={() => { setQuickAssign(false); fetchLeads(); }} />}
      {converting && <ConvertToClient lead={converting} onClose={() => setConverting(null)} onConverted={() => { setConverting(null); fetchLeads(); }} />}
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/leads/api';
import { ListChecks, X, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Check } from 'lucide-react';
import { toast } from '@/components/kit';
import { STATUS_COLORS, statusBadgeClass } from '@/lib/leads/metaLeadStatus';

const EMPTY_FORM = { name: '', color: 'blue', isConversion: false };

// Modal where an admin/manager defines the statuses telecallers move Meta leads through
const MetaLeadStatusManager = ({ onClose }) => {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    try {
      const response = await api.get('/company/integrations/meta/lead-statuses');
      setStatuses(response.data);
    } catch (error) {
      toast.error('Failed to load lead statuses');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/company/integrations/meta/lead-statuses/${editingId}`, form);
        toast.success('Status updated');
      } else {
        await api.post('/company/integrations/meta/lead-statuses', form);
        toast.success('Status added');
      }
      resetForm();
      fetchStatuses();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save status');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (status) => {
    setEditingId(status._id);
    setForm({ name: status.name, color: status.color, isConversion: status.isConversion });
  };

  const handleToggleActive = async (status) => {
    try {
      await api.put(`/company/integrations/meta/lead-statuses/${status._id}`, { isActive: !status.isActive });
      fetchStatuses();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (status) => {
    if (!window.confirm(`Are you sure you want to delete the status "${status.name}"? Leads keep it in their history.`)) return;
    try {
      await api.delete(`/company/integrations/meta/lead-statuses/${status._id}`);
      toast.success('Status deleted');
      if (editingId === status._id) resetForm();
      fetchStatuses();
    } catch (error) {
      toast.error('Failed to delete status');
    }
  };

  const handleMove = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;

    const reordered = [...statuses];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setStatuses(reordered); // optimistic

    try {
      const response = await api.put('/company/integrations/meta/lead-statuses/reorder', {
        statusIds: reordered.map((s) => s._id),
      });
      setStatuses(response.data);
    } catch (error) {
      toast.error('Failed to reorder statuses');
      fetchStatuses();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-hidden shadow-xl animate-fade-in flex flex-col">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-blue-600" /> Lead Statuses
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
          <p className="text-xs text-slate-500 leading-relaxed">
            These are the statuses counsellors choose from when they work a Meta lead. Each counsellor keeps a separate status track for every lead.
          </p>

          {/* Add / edit form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-slate-200 space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {editingId ? 'Edit status' : 'Add status'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                maxLength={40}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Status name, e.g. Site Visit"
                className="input-field sm:col-span-2"
              />
              <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="input-field py-2">
                {STATUS_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isConversion}
                onChange={(e) => setForm({ ...form, isConversion: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              Counts as a conversion in the performance report
            </label>
            <div className="flex items-center justify-end gap-3">
              {editingId && (
                <button type="button" onClick={resetForm} className="btn-outline px-4 py-2 border-slate-200 text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saving} className="btn-primary px-4 py-2 disabled:opacity-60">
                {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {editingId ? 'Save Changes' : 'Add Status'}
              </button>
            </div>
          </form>

          {/* Existing statuses, in pipeline order */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : statuses.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {statuses.map((status, index) => (
                <div key={status._id} className="flex items-center gap-3 p-3">
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      className="text-slate-500 hover:text-blue-600 disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(index, 1)}
                      disabled={index === statuses.length - 1}
                      className="text-slate-500 hover:text-blue-600 disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-[11px] uppercase font-bold ${statusBadgeClass(status.color)} ${status.isActive ? '' : 'opacity-50'}`}>
                      {status.name}
                    </span>
                    {status.isConversion && <span className="text-[11px] font-bold uppercase text-emerald-700">Conversion</span>}
                    {!status.isActive && <span className="text-[11px] font-bold uppercase text-slate-500">Hidden</span>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleActive(status)}
                      className="text-[11px] font-bold uppercase text-slate-500 hover:text-blue-600"
                      title={status.isActive ? 'Counsellors can choose this status' : 'Counsellors cannot choose this status'}
                    >
                      {status.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button onClick={() => handleEdit(status)} className="text-slate-500 hover:text-blue-600" title="Edit">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(status)} className="text-slate-500 hover:text-rose-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-semibold py-6 text-center">No statuses yet. Add the first one above.</p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end shrink-0">
          <button onClick={onClose} className="btn-outline px-4 py-2 border-slate-200 text-slate-500 hover:bg-slate-50">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default MetaLeadStatusManager;

export function leadUserId(ref) {
  if (!ref) return null;
  const id = ref._id ?? ref.id ?? ref;
  return id ? String(id) : null;
}

/** @param {string} id history row uses `id`; populated assignee uses `_id`. */
export function historyEntryUserId(entry) {
  if (!entry) return null;
  return leadUserId(entry.id != null ? { id: entry.id } : entry);
}

/** Unassigned now, but this user held the lead before (assignment history). */
export function leadHeldByUserBefore(lead, userId) {
  if (!lead || !userId || lead.assignedTo) return false;
  const uid = String(userId);
  return (lead.assignmentHistory || []).some((h) => historyEntryUserId(h) === uid);
}

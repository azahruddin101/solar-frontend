export const LEAD_CONVERTED_LOCK_HINT = 'This lead is converted. Status and assignment can no longer be changed.';

/** Whether status and assignment are frozen (converted to client or on the converted pipeline status). */
export function isLeadStatusLocked(lead, statuses = []) {
  if (lead?.convertedClient) return true;
  const statusId = lead?.currentStatus?._id || lead?.status?._id || lead?.adminStatus?._id;
  if (!statusId) return false;
  return statuses.some((s) => String(s._id) === String(statusId) && (s.outcome === 'converted' || s.isConversion));
}

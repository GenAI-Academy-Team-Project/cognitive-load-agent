export type ListRecord = Record<string, unknown>;
export function asListRecord(value: unknown): ListRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ListRecord : {};
}
const searchableFields = ['title', 'detail', 'name', 'display_name', 'email', 'owner', 'category', 'categories', 'kind', 'type', 'status', 'policy_status', 'channel', 'target_name', 'value', 'source', 'contributor', 'trigger', 'evidence', 'decision', 'outcome', 'tool', 'action', 'subject', 'attribute', 'relationship', 'organization', 'notes', 'label', 'reason', 'error', 'error_code', 'capabilities', 'delivery_state', 'content', 'start_at', 'end_at'];
export function listSearchText(value: unknown): string {
  const record = asListRecord(value);
  const text = searchableFields.map((key) => {
    const field = record[key];
    return typeof field === 'string' ? field : Array.isArray(field) ? field.filter((part) => typeof part === 'string').join(' ') : '';
  });
  if (record.payload) text.push(listSearchText(record.payload));
  return text.join(' ').toLocaleLowerCase();
}
export function listNeedsAttention(value: unknown, now: number): boolean {
  const record = asListRecord(value);
  const status = typeof record.status === 'string' ? record.status : typeof record.delivery_state === 'string' ? record.delivery_state : '';
  if (['complete', 'archived', 'resolved', 'rejected', 'executed', 'applied', 'cancelled'].includes(status)) return false;
  if (['failed', 'unknown', 'sending'].includes(typeof record.provider_status === 'string' ? record.provider_status : '')) return true;
  if (['pending', 'needs_approval', 'failed', 'unknown', 'sending', 'blocked', 'overdue', 'unverified', 'proposed'].includes(status)) return true;
  if (record.kind === 'risk' || record.severity || ['urgent', 'critical', 'high', 'primary', 'important'].includes(typeof record.priority === 'string' ? record.priority : '')) return true;
  const due = typeof record.due_at === 'string' ? Date.parse(record.due_at) : NaN;
  return Number.isFinite(due) && due < now;
}
export const listFacetFields = [
  ['status', 'Status'], ['delivery_state', 'Delivery status'], ['category', 'Category'], ['owner', 'Owner'], ['channel', 'Channel'], ['severity', 'Severity'], ['priority', 'Priority'], ['kind', 'Type'], ['role', 'Role'], ['source', 'Source'], ['contributor', 'Contributor'], ['relationship', 'Relationship'],
] as const;
export const listFilterLabel = (value: string) => value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());

// Legacy records store either provenance or a contributor name in `source`.
// Match only known care-circle names; never guess from the shape of the text.
export function splitListProvenance<T extends { source: string }>(record: T, members: readonly { display_name: string }[]): T & { contributor: string } {
  const contributor = members.find((member) => member.display_name === record.source)?.display_name;
  return { ...record, source: contributor ? '' : record.source, contributor: contributor || '' };
}

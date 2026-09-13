import type { ActionRow } from './calendar-service';
import type { CalendarAction } from './calendar-types';

// Read existing receipts so historical invites appear without replaying a send.
// Only expose actions belonging to the signed-in organizer and care recipient.
export async function calendarNotificationHistory(db: D1Database, recipientId: string, memberId: string) {
  const rows = (await db.prepare("SELECT * FROM calendar_actions WHERE recipient_id=? AND member_id=? AND (status='executed' OR json_extract(payload_json,'$.googleConfirmed')=1) ORDER BY updated_at DESC").bind(recipientId, memberId).all<ActionRow>()).results;
  return rows.flatMap(row => {
    const payload = JSON.parse(row.payload_json) as CalendarAction['payload'];
    if (!payload.attendees.length) return [];
    const label = row.kind === 'create' ? 'Calendar invitation' : row.kind === 'cancel' ? 'Calendar cancellation' : 'Calendar update';
    return [{ action_id: `calendar-${row.id}`, channel: 'google_calendar', status: 'accepted', error_code: null, created_at: row.updated_at, target_name: payload.attendees.join(', '), title: `${label}: ${payload.title}` }];
  });
}

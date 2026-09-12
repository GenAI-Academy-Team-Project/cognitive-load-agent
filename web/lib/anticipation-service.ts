import { currentMemories } from './current-memories';
import type {
  AnticipationState,
  AppointmentNotes,
  CarePreference,
  CareRoutine,
} from './anticipation-types';
import type { CareEvent } from './types';

export async function loadAnticipation(
  db: D1Database,
  recipientId: string,
  memberId: string,
): Promise<AnticipationState> {
  const rows = async <T>(sql: string, args: unknown[] = [recipientId]) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results;
  const [
    settings,
    preferences,
    routines,
    notes,
    events,
    generated,
    verifiedMemories,
  ] = await Promise.all([
    rows<{ daily_minutes: number; digest_hour: number; focus_mode: number }>(
      'SELECT * FROM attention_settings WHERE recipient_id=? AND member_id=?',
      [recipientId, memberId],
    ),
    rows<CarePreference>('SELECT * FROM care_preferences WHERE recipient_id=?'),
    rows<CareRoutine>(
      'SELECT * FROM care_routines WHERE recipient_id=? ORDER BY next_at',
    ),
    rows<AppointmentNotes>(
      'SELECT * FROM appointment_notes WHERE recipient_id=? AND member_id=?',
      [recipientId, memberId],
    ),
    rows<CareEvent>(
      "SELECT e.* FROM events e JOIN record_scopes s ON s.entity_id=e.id AND s.entity_type='event' WHERE s.recipient_id=? AND e.occurred_at>=? ORDER BY e.occurred_at DESC LIMIT 20",
      [recipientId, new Date(Date.now() - 14 * 86400000).toISOString()],
    ),
    rows<{ source_key: string }>(
      'SELECT source_key FROM generated_batches WHERE recipient_id=?',
    ),
    currentMemories(db, recipientId),
  ]);
  const saved = preferences[0];
  const valid =
    saved &&
    verifiedMemories.some(
      (memory) =>
        memory.id === saved.memory_id && memory.value === saved.memory_value,
    );
  return {
    settings: settings[0]
      ? { ...settings[0], focus_mode: Boolean(settings[0].focus_mode) }
      : { daily_minutes: 120, digest_hour: 18, focus_mode: true },
    preference: valid ? saved : null,
    preferenceNeedsReview: Boolean(saved && !valid),
    routines,
    notes,
    events,
    verifiedMemories,
    generatedKeys: generated.map((item) => item.source_key),
  };
}

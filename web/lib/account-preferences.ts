import type { CurrentUser } from './types';

export async function accountPreferences(db: D1Database, accountId: string) {
  const row = await db.prepare('SELECT input_preference, spoken_replies, auto_listen_on_open FROM account_preferences WHERE account_id=?').bind(accountId).first<{ input_preference: NonNullable<CurrentUser['inputPreference']>; spoken_replies: number; auto_listen_on_open: number }>();
  return { inputPreference: row?.input_preference ?? 'voice', spokenReplies: row ? row.spoken_replies === 1 : true, autoListenOnOpen: row?.auto_listen_on_open === 1 };
}

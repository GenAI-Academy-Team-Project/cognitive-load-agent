export class AppError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}

const limits: Record<string, number> = {
  value: 2000, careContext: 2000, communicationNotes: 1000, mobilityNotes: 1000,
  emergencyPlan: 1500, notes: 1000, title: 200, name: 100, displayName: 100,
  preferredName: 100, source: 200, organization: 200, relationship: 120,
  email: 254, phone: 40, timezone: 80, purpose: 1000,
  message: 1200, category: 80,
};

export function validatePayload(body: Record<string, unknown>) {
  if (typeof body.action !== 'string' || !body.action || body.action.length > 80) throw new AppError('invalid_action', 400, 'A valid action is required');
  for (const [key, max] of Object.entries(limits)) {
    const value = body[key];
    if (value !== undefined && typeof value !== 'string') throw new AppError('invalid_field_type', 400, `${key} must be text`);
    if (typeof value === 'string' && value.length > max) throw new AppError('field_too_long', 400, `${key} is too long`);
  }
  if (typeof body.email === 'string' && body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new AppError('invalid_email', 400, 'Enter a valid email address');
  if (typeof body.phone === 'string' && body.phone && !/^[+()\-.\s\d]{7,40}$/.test(body.phone)) throw new AppError('invalid_phone', 400, 'Enter a valid phone number');
  if (typeof body.timezone === 'string' && body.timezone && !/^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)*$/.test(body.timezone)) throw new AppError('invalid_timezone', 400, 'Enter a valid timezone');
  if (typeof body.dueAt === 'string' && body.dueAt && Number.isNaN(Date.parse(body.dueAt))) throw new AppError('invalid_date', 400, 'Enter a valid due date');
}

const policies: Record<string, { limit: number; seconds: number }> = {
  renew_invitation: { limit: 10, seconds: 3600 },
  auth_email: { limit: 10, seconds: 900 }, auth_ip: { limit: 40, seconds: 900 },
  run_check: { limit: 10, seconds: 60 }, invite_member: { limit: 10, seconds: 3600 },
  export: { limit: 5, seconds: 3600 }, delete_recipient: { limit: 3, seconds: 3600 },
  chat_message: { limit: 30, seconds: 60 }, chat_action: { limit: 12, seconds: 60 },
};

export async function enforceRateLimit(db: D1Database, actorUserId: string, action: string) {
  const policy = policies[action] ?? { limit: 60, seconds: 60 };
  const cutoff = new Date(Date.now() - policy.seconds * 1000).toISOString();
  const current = await db.prepare('SELECT COUNT(*) count FROM rate_limit_events WHERE actor_user_id=? AND action=? AND created_at>=?').bind(actorUserId, action, cutoff).first<{ count: number }>();
  if ((current?.count ?? 0) >= policy.limit) throw new AppError('rate_limited', 429, 'Too many requests. Please wait and try again.');
  await db.batch([
    db.prepare('INSERT INTO rate_limit_events VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), actorUserId, action, new Date().toISOString()),
    db.prepare('DELETE FROM rate_limit_events WHERE created_at<?').bind(new Date(Date.now() - 86400000).toISOString()),
  ]);
}

export async function recordError(db: D1Database, input: { requestId: string; route: string; action: string; errorCode: string; actorUserId?: string; recipientId?: string }) {
  try {
    await db.prepare('INSERT INTO error_events VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), input.requestId, input.route, input.action.slice(0, 80), input.errorCode, input.actorUserId || 'unknown', input.recipientId || null, new Date().toISOString()).run();
  } catch { /* Monitoring must never mask the original response. */ }
}

export function errorResponse(error: unknown, requestId: string) {
  if (error instanceof AppError) return Response.json({ error: error.message, requestId }, { status: error.status });
  return Response.json({ error: 'Carestead could not complete this request', requestId }, { status: 500 });
}

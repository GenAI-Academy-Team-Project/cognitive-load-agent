import { canWrite, type CareMembership, type CareRole } from './auth';
import { AppError } from './guardrails';
import { localToInstant } from './calendar-time';
import { calendarCarePlan, assertCalendarCarePlan } from './calendar-care-plan';
import type { CalendarAction, CalendarAppointment, CalendarDraft } from './calendar-types';
import { accessToken, calendarRequest, eventPath, getGoogleEvent, type GoogleConfig, type GoogleConnection, type GoogleEvent } from './google-calendar';

export type CalendarContext = { db: D1Database; member: CareMembership; recipientId: string; recipientName: string; timeZone: string; role: CareRole; consent: boolean };
export type ActionRow = { id: string; recipient_id: string; member_id: string; connection_id: string; kind: CalendarAction['kind']; payload_json: string; status: CalendarAction['status']; error: string | null; html_link: string | null; updated_at: string };
export const publicAction = (row: ActionRow): CalendarAction => ({ id: row.id, kind: row.kind, status: row.status, payload: JSON.parse(row.payload_json), error: row.error, htmlLink: row.html_link });
export async function calendarContext(db: D1Database, member: CareMembership, recipientId: string): Promise<CalendarContext> {
  const access = await db.prepare("SELECT cr.display_name name, cr.timezone, rm.access_role role, c.status consent FROM recipient_members rm JOIN care_recipients cr ON cr.id=rm.recipient_id LEFT JOIN consent_records c ON c.recipient_id=cr.id WHERE rm.member_id=? AND rm.recipient_id=? AND cr.status='active'").bind(member.memberId, recipientId).first<{ name: string; timezone: string; role: CareRole; consent: string }>();
  if (!access) throw new AppError('recipient_forbidden', 403, 'You do not have access to this care recipient.');
  return { db, member, recipientId, recipientName: access.name, timeZone: access.timezone, role: access.role, consent: access.consent === 'active' };
}
export function requireCalendarWrite(context: CalendarContext) {
  if (!canWrite(context.role)) throw new AppError('calendar_forbidden', 403, 'Only owners and caregivers can schedule appointments.');
  if (!context.consent) throw new AppError('consent_withdrawn', 409, 'Consent is withdrawn. Calendar actions are paused for this recipient.');
}
export async function connectionFor(context: CalendarContext) {
  return context.db.prepare('SELECT * FROM google_connections WHERE member_id=?').bind(context.member.memberId).first<GoogleConnection>();
}
export async function requireConnection(context: CalendarContext) {
  const connection = await connectionFor(context);
  if (!connection || connection.status !== 'connected') throw new AppError('google_reconnect', 409, 'Connect your Google account to continue.');
  return connection;
}
export function field(body: Record<string, unknown>, key: string, max = 200, required = true) {
  const value = body[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new AppError('invalid_calendar_field', 400, `Enter a valid ${key}.`);
  return value.trim();
}
function draftFor(body: Record<string, unknown>): CalendarDraft {
  const timeZone = field(body, 'timeZone', 80);
  const start = localToInstant(field(body, 'startLocal', 16), timeZone);
  const end = localToInstant(field(body, 'endLocal', 16), timeZone);
  if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 7 * 86400000) throw new AppError('invalid_duration', 400, 'The end must be after the start, within seven days.');
  if (Date.parse(start) < Date.now()) throw new AppError('past_appointment', 400, 'Choose a future appointment time.');
  const attendeeText = field(body, 'attendees', 3000, false);
  const attendees = [...new Set(attendeeText.split(/[,;\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (attendees.length > 20 || attendees.some((email) => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new AppError('invalid_attendees', 400, 'Enter up to 20 valid guest email addresses separated by commas.');
  const reminderMinutes = body.reminderMinutes;
  if (typeof reminderMinutes !== 'number' || ![0, 10, 30, 60, 1440].includes(reminderMinutes)) throw new AppError('invalid_reminder', 400, 'Choose a reminder from the list.');
  return { title: field(body, 'title'), start, end, timeZone, location: field(body, 'location', 500, false), attendees, reminderMinutes };
}

export async function proposeCalendarAction(context: CalendarContext, config: GoogleConfig, body: Record<string, unknown>) {
  requireCalendarWrite(context);
  const { db, member, recipientId } = context;
  const kind = field(body, 'kind');
  if (!['create', 'reschedule', 'cancel'].includes(kind)) throw new AppError('invalid_calendar_action', 400, 'Choose a calendar action.');
  const connection = await requireConnection(context);
  const binding = await db.prepare('SELECT * FROM calendar_bindings WHERE member_id=? AND recipient_id=? AND connection_id=?').bind(member.memberId, recipientId, connection.id).first<{ calendar_id: string; calendar_name: string }>();
  if (!binding) throw new AppError('calendar_required', 400, 'Choose a calendar for this recipient first.');
  const id = crypto.randomUUID();
  let draft: CalendarDraft;
  let taskId = field(body, 'taskId', 100, false);
  let appointmentId = id;
  let eventId = id.replaceAll('-', '');
  let etag = '';
  let calendarId = binding.calendar_id;
  if (kind === 'create') {
    draft = draftFor(body);
    if (taskId) {
      const task = await db.prepare("SELECT t.id FROM tasks t JOIN record_scopes s ON s.entity_type='task' AND s.entity_id=t.id WHERE s.recipient_id=? AND t.id=? AND t.status NOT IN ('archived','complete')").bind(recipientId, taskId).first();
      if (!task) throw new AppError('task_not_found', 404, 'Choose an active responsibility for this recipient.');
      if (await db.prepare("SELECT id FROM calendar_appointments WHERE task_id=? AND status='confirmed'").bind(taskId).first()) throw new AppError('already_scheduled', 409, 'This responsibility already has a calendar appointment.');
    } else taskId = `calendar-${id}`;
  } else {
    appointmentId = field(body, 'appointmentId', 100);
    const appointment = await db.prepare("SELECT * FROM calendar_appointments WHERE id=? AND recipient_id=? AND member_id=? AND connection_id=? AND status='confirmed'").bind(appointmentId, recipientId, member.memberId, connection.id).first<CalendarAppointment>();
    if (!appointment) throw new AppError('appointment_not_found', 404, 'This appointment is not managed by your connected Google account.');
    if (appointment.calendar_id !== binding.calendar_id) throw new AppError('calendar_mismatch', 409, 'Select this appointment’s calendar before changing it.');
    const token = await accessToken(db, config, connection);
    const current = await getGoogleEvent(token, appointment.calendar_id, appointment.event_id);
    if (!current || current.status === 'cancelled' || !current.start?.dateTime || !current.end?.dateTime) throw new AppError('calendar_changed', 409, 'This appointment was removed or changed in Google Calendar. Manage it in Google Calendar.');
    eventId = current.id; etag = current.etag; calendarId = appointment.calendar_id; taskId = appointment.task_id;
    draft = { title: current.summary || 'Care appointment', start: current.start.dateTime, end: current.end.dateTime, timeZone: current.start.timeZone || appointment.timezone, location: current.location || '', attendees: (current.attendees || []).map((guest) => guest.email), reminderMinutes: Number(appointment.reminder_minutes) };
    if (kind === 'reschedule') {
      const next = draftFor({ ...body, title: draft.title, location: draft.location, attendees: typeof body.attendees === 'string' ? body.attendees : draft.attendees.join(','), reminderMinutes: draft.reminderMinutes });
      draft = { ...draft, start: next.start, end: next.end, timeZone: next.timeZone, attendees: next.attendees };
    }
  }
  const payload: CalendarAction['payload'] = { ...draft, taskId, appointmentId, eventId, etag, calendarId, calendarName: binding.calendar_name, organizer: connection.email };
  if (kind === 'reschedule') payload.carePlan = await calendarCarePlan(db, recipientId, member.memberId, taskId, draft.start, draft.end, draft.timeZone);
  const now = new Date().toISOString();
  // One unresolved action per task prevents overlapping creation or updates in this app.
  const inserted = await db.prepare("INSERT INTO calendar_actions SELECT ?,?,?,?,?,?, 'pending',NULL,NULL,?,? WHERE NOT EXISTS (SELECT 1 FROM calendar_actions WHERE recipient_id=? AND json_extract(payload_json,'$.taskId')=? AND status IN ('pending','executing','failed','uncertain'))").bind(id, recipientId, member.memberId, connection.id, kind, JSON.stringify(payload), now, now, recipientId, taskId).run();
  if (!inserted.meta.changes) throw new AppError('proposal_exists', 409, 'This responsibility already has an unresolved calendar action. Complete or discard it first.');
  return id;
}

export async function editCalendarAction(context: CalendarContext, config: GoogleConfig, actionId: string, body: Record<string, unknown>) {
  requireCalendarWrite(context);
  const action = await context.db.prepare('SELECT * FROM calendar_actions WHERE id=? AND recipient_id=? AND member_id=?').bind(actionId, context.recipientId, context.member.memberId).first<ActionRow>();
  if (!action) throw new AppError('action_not_found', 404, 'Calendar action not found.');
  if (!['pending', 'failed'].includes(action.status) || action.kind === 'cancel') throw new AppError('action_in_progress', 409, 'This proposal cannot be edited. Check any pending Google result first.');
  const connection = await requireConnection(context);
  if (connection.id !== action.connection_id) throw new AppError('account_changed', 409, 'Reconnect the Google account used for this proposal.');
  const payload = JSON.parse(action.payload_json) as CalendarAction['payload'];
  const binding = await context.db.prepare('SELECT 1 FROM calendar_bindings WHERE member_id=? AND recipient_id=? AND connection_id=? AND calendar_id=?').bind(context.member.memberId, context.recipientId, connection.id, payload.calendarId).first();
  if (!binding) throw new AppError('calendar_changed', 409, 'Select the calendar used in this proposal before editing.');
  let draft = draftFor(body);
  if (action.kind === 'reschedule') {
    const current = await getGoogleEvent(await accessToken(context.db, config, connection), payload.calendarId, payload.eventId);
    if (!current || current.status === 'cancelled' || current.etag !== payload.etag) throw new AppError('calendar_changed', 409, 'This event changed in Google Calendar. Discard this proposal and review it again.');
    draft = { ...payload, start: draft.start, end: draft.end, timeZone: draft.timeZone, attendees: typeof body.attendees === 'string' ? draft.attendees : payload.attendees };
  }
  const next = { ...payload, ...draft };
  if (action.kind === 'reschedule') next.carePlan = await calendarCarePlan(context.db, context.recipientId, context.member.memberId, payload.taskId, next.start, next.end, next.timeZone);
  const updated = await context.db.prepare("UPDATE calendar_actions SET payload_json=?,status='pending',error=NULL,updated_at=? WHERE id=? AND status IN ('pending','failed') AND payload_json=?").bind(JSON.stringify(next), new Date().toISOString(), action.id, action.payload_json).run();
  if (!updated.meta.changes) throw new AppError('action_in_progress', 409, 'This proposal changed while you were editing. Refresh and review it again.');
}

async function writeGoogleAction(token: string, action: ActionRow, payload: CalendarAction['payload']) {
  const current = await getGoogleEvent(token, payload.calendarId, payload.eventId);
  const marker = current?.extendedProperties?.private?.caresteadActionId;
  // A retry first reconciles an earlier successful write (including an interrupted D1 commit).
  if (action.kind === 'cancel' && (!current || current.status === 'cancelled')) return current;
  if (marker === action.id && current?.status !== 'cancelled') {
    if (Date.parse(current?.start?.dateTime || '') !== Date.parse(payload.start) || Date.parse(current?.end?.dateTime || '') !== Date.parse(payload.end)) throw new AppError('calendar_changed', 409, 'This event changed after the approved Google update. Review it in Google Calendar before recovering the care plan.');
    return current;
  }
  const path = eventPath(payload.calendarId, payload.eventId);
  if (action.kind === 'create') {
    if (current) throw new AppError('calendar_changed', 409, 'An event already uses this identifier. Discard this proposal and prepare a new one.');
    const response = await calendarRequest(token, `calendars/${encodeURIComponent(payload.calendarId)}/events?sendUpdates=all`, { method: 'POST', body: JSON.stringify({ id: payload.eventId, summary: payload.title, location: payload.location, start: { dateTime: payload.start, timeZone: payload.timeZone }, end: { dateTime: payload.end, timeZone: payload.timeZone }, attendees: payload.attendees.map((email) => ({ email })), visibility: 'private', guestsCanInviteOthers: false, guestsCanSeeOtherGuests: false, reminders: { useDefault: false, overrides: payload.reminderMinutes ? [{ method: 'popup', minutes: payload.reminderMinutes }] : [] }, extendedProperties: { private: { caresteadActionId: action.id } } }) }, [409]);
    if (response.status === 409) {
      const existing = await getGoogleEvent(token, payload.calendarId, payload.eventId);
      if (existing?.extendedProperties?.private?.caresteadActionId === action.id && existing.status !== 'cancelled') return existing;
      throw new AppError('calendar_changed', 409, 'Google reports an event conflict. Discard and prepare a new proposal.');
    }
    return await response.json() as GoogleEvent;
  }
  if (!current || current.status === 'cancelled' || current.etag !== payload.etag) throw new AppError('calendar_changed', 409, 'This event changed in Google Calendar. Discard this proposal and review it again.');
  if (action.kind === 'cancel') {
    await calendarRequest(token, `${path}?sendUpdates=all`, { method: 'DELETE', headers: { 'If-Match': payload.etag } }, [410]);
    return null;
  }
  const response = await calendarRequest(token, `${path}?sendUpdates=all`, { method: 'PATCH', headers: { 'If-Match': payload.etag }, body: JSON.stringify({ start: { dateTime: payload.start, timeZone: payload.timeZone }, end: { dateTime: payload.end, timeZone: payload.timeZone }, attendees: payload.attendees.map(email => current.attendees?.find(guest => guest.email.toLowerCase() === email.toLowerCase()) || { email }), extendedProperties: { private: { ...current.extendedProperties?.private, caresteadActionId: action.id } } }) });
  return await response.json() as GoogleEvent;
}

export async function approveCalendarAction(context: CalendarContext, config: GoogleConfig, actionId: string) {
  requireCalendarWrite(context);
  const { db, member, recipientId } = context;
  const action = await db.prepare('SELECT * FROM calendar_actions WHERE id=? AND recipient_id=? AND member_id=?').bind(actionId, recipientId, member.memberId).first<ActionRow>();
  if (!action) throw new AppError('action_not_found', 404, 'Calendar action not found.');
  if (action.status === 'executed') return;
  if (action.status === 'rejected') throw new AppError('action_decided', 409, 'This proposal was discarded.');
  const connection = await requireConnection(context);
  if (connection.id !== action.connection_id) throw new AppError('account_changed', 409, 'Reconnect the Google account used for this proposal.');
  const payload = JSON.parse(action.payload_json) as CalendarAction['payload'];
  const reviewedCarePlan = payload.carePlan;
  if (action.kind === 'reschedule') {
    const currentPlan = await calendarCarePlan(db, recipientId, member.memberId, payload.taskId, payload.start, payload.end, payload.timeZone);
    assertCalendarCarePlan(reviewedCarePlan, currentPlan);
    payload.carePlan = currentPlan;
  }
  if (action.status === 'pending' && action.kind !== 'cancel' && Date.parse(payload.start) <= Date.now()) throw new AppError('past_appointment', 409, 'This proposal’s start time has passed. Discard it and choose a future time.');
  const binding = await db.prepare('SELECT 1 FROM calendar_bindings WHERE member_id=? AND recipient_id=? AND connection_id=? AND calendar_id=?').bind(member.memberId, recipientId, connection.id, payload.calendarId).first();
  if (!binding) throw new AppError('calendar_changed', 409, 'Select the calendar used in this proposal before approving.');
  const plan = await db.prepare("SELECT id FROM care_plans WHERE recipient_id=? AND status='active' ORDER BY activated_at DESC LIMIT 1").bind(recipientId).first<{ id: string }>();
  if (!plan) throw new AppError('plan_not_found', 404, 'Active care plan not found.');
  if (action.kind === 'create') {
    if (action.status === 'pending' && payload.taskId !== `calendar-${action.id}`) {
      const task = await db.prepare("SELECT 1 FROM tasks t JOIN record_scopes s ON s.entity_type='task' AND s.entity_id=t.id WHERE t.id=? AND s.recipient_id=? AND t.status NOT IN ('archived','complete')").bind(payload.taskId, recipientId).first();
      if (!task) throw new AppError('task_changed', 409, 'The linked responsibility is no longer active. Discard this proposal and review the care plan.');
    }
    const linked = await db.prepare("SELECT id FROM calendar_appointments WHERE task_id=? AND status='confirmed' AND id<>?").bind(payload.taskId, payload.appointmentId).first();
    if (linked) throw new AppError('already_scheduled', 409, 'This responsibility already has an appointment.');
  }
  const now = new Date().toISOString();
  const claimed = await db.prepare("UPDATE calendar_actions SET status='executing',error=NULL,updated_at=? WHERE id=? AND payload_json=? AND (status IN ('pending','failed','uncertain') OR (status='executing' AND updated_at<?))").bind(now, action.id, action.payload_json, new Date(Date.now() - 120000).toISOString()).run();
  if (!claimed.meta.changes) throw new AppError('action_in_progress', 409, 'This action is already being processed. Refresh shortly.');
  let googleConfirmed = Boolean(payload.googleConfirmed);
  try {
    const token = await accessToken(db, config, connection);
    const result = await writeGoogleAction(token, action, payload);
    googleConfirmed = true;
    payload.googleConfirmed = true;
    const link = action.kind === 'cancel' ? '' : result?.htmlLink || '';
    // Persist external success separately so a failed local transaction is visible
    // and recoverable. The action is not complete until the following batch commits.
    const receipt = await db.prepare("UPDATE calendar_actions SET payload_json=?,html_link=? WHERE id=? AND status='executing' AND updated_at=?").bind(JSON.stringify(payload), link, action.id, now).run();
    if (!receipt.meta.changes) throw new AppError('action_in_progress', 409, 'Another recovery is checking this action. Refresh to see its result.');
    if (action.kind === 'reschedule') assertCalendarCarePlan(payload.carePlan, await calendarCarePlan(db, recipientId, member.memberId, payload.taskId, payload.start, payload.end, payload.timeZone));
    const dependents = payload.carePlan?.changes.filter(change => change.taskId !== payload.taskId) || [];
    const evidence = payload.carePlan?.changes.map(change => `${change.title}: ${change.before} → ${change.after} (${change.owner})`).join('; ') || `Recipient-scoped ${action.kind} proposal`;
    const outcome = action.kind === 'cancel' ? 'Appointment cancelled in Google Calendar.' : action.kind === 'reschedule' ? `Appointment rescheduled in Google Calendar.${dependents.length ? ` ${dependents.length} linked responsibilities updated in Carestead; caregiver acceptance needs review.` : ''}` : 'Appointment created in Google Calendar.';
    const scope = (type: string, id: string) => db.prepare('INSERT OR IGNORE INTO record_scopes VALUES (?,?,?,?,?,?)').bind(`calendar-${type}-${action.id}`, type, id, recipientId, plan.id, now);
    const statements = [
      db.prepare("INSERT INTO planning_guards SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM calendar_actions WHERE id=? AND status='executing' AND updated_at=? AND payload_json=?) AND EXISTS(SELECT 1 FROM consent_records WHERE recipient_id=? AND status='active') THEN 1 ELSE 0 END").bind(`calendar-guard-${action.id}`, action.id, now, JSON.stringify(payload), recipientId),
      db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?)').bind(`calendar-${action.id}`, 'appointment', outcome, `${payload.title} · ${payload.start} · ${payload.timeZone}`, member.displayName, now), scope('event', `calendar-${action.id}`),
      db.prepare('INSERT OR IGNORE INTO traces VALUES (?,?,?,?,?,?,?,?)').bind(`calendar-${action.id}`, 'Caregiver-approved calendar action', evidence, dependents.length ? 'Reschedule appointment and linked responsibilities' : action.kind, 'approved by human', 'Google Calendar', outcome, now), scope('trace', `calendar-${action.id}`),
      db.prepare('INSERT OR IGNORE INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(`calendar-${action.id}`, member.id, member.email, action.kind, 'calendar_action', action.id, outcome, now),
      db.prepare("UPDATE calendar_actions SET status='executed',error=NULL,html_link=?,updated_at=? WHERE id=?").bind(link, now, action.id),
    ];
    if (action.kind === 'create') {
      statements.push(db.prepare('INSERT INTO calendar_appointments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(payload.appointmentId, recipientId, member.memberId, connection.id, payload.calendarId, payload.eventId, payload.taskId, payload.title, payload.start, payload.end, payload.timeZone, payload.location, JSON.stringify(payload.attendees), String(payload.reminderMinutes), 'confirmed', link, now));
      // Existing responsibilities keep their title, owner and category.
      statements.push(db.prepare('INSERT OR IGNORE INTO tasks VALUES (?,?,?,?,?,?,?)').bind(payload.taskId, payload.title, member.displayName, payload.start, 'scheduled', 'appointment', null));
      statements.push(scope('task', payload.taskId));
    } else {
      statements.push(db.prepare('UPDATE calendar_appointments SET start_at=?,end_at=?,timezone=?,title=?,location=?,attendees_json=?,status=?,html_link=?,updated_at=? WHERE id=? AND recipient_id=?').bind(payload.start, payload.end, payload.timeZone, payload.title, payload.location, JSON.stringify(payload.attendees), action.kind === 'cancel' ? 'cancelled' : 'confirmed', link, now, payload.appointmentId, recipientId));
    }
    statements.push(db.prepare('UPDATE tasks SET due_at=?,status=? WHERE id=? AND id IN (SELECT entity_id FROM record_scopes WHERE recipient_id=? AND entity_type=?)').bind(payload.start, action.kind === 'cancel' ? 'open' : 'scheduled', payload.taskId, recipientId, 'task'));
    for (const change of dependents) statements.push(db.prepare("UPDATE tasks SET due_at=? WHERE id=? AND id IN (SELECT entity_id FROM record_scopes WHERE recipient_id=? AND entity_type='task')").bind(change.after, change.taskId, recipientId));
    if (action.kind === 'reschedule') {
      for (const change of payload.carePlan!.changes) {
        statements.push(db.prepare("UPDATE task_planning SET accepted_signature='' WHERE task_id=? AND recipient_id=?").bind(change.taskId, recipientId));
      }
      // The root's planning duration follows the approved appointment duration.
      statements.push(db.prepare('UPDATE task_planning SET duration_minutes=? WHERE task_id=? AND recipient_id=?').bind((Date.parse(payload.end) - Date.parse(payload.start)) / 60000, payload.taskId, recipientId));
    }
    if (action.kind === 'cancel') statements.push(db.prepare("UPDATE task_planning SET accepted_signature='' WHERE task_id=? AND recipient_id=?").bind(payload.taskId, recipientId));
    statements.push(db.prepare('DELETE FROM planning_guards WHERE id=?').bind(`calendar-guard-${action.id}`));
    await db.batch(statements);
  } catch (error) {
    const uncertain = googleConfirmed || !(error instanceof AppError) || error.code === 'google_unavailable';
    const message = googleConfirmed ? 'Google Calendar was updated, but the care-plan save is incomplete. Retry / check result to finish, or review remaining changes if the plan has changed.' : error instanceof AppError ? error.message : 'The result needs verification. Retry to reconcile with Google Calendar.';
    await db.prepare("UPDATE calendar_actions SET status=?,error=?,payload_json=?,updated_at=? WHERE id=? AND status='executing' AND updated_at=?").bind(uncertain ? 'uncertain' : 'failed', message, JSON.stringify(payload), new Date().toISOString(), action.id, now).run();
    if (googleConfirmed) throw new AppError('care_plan_incomplete', 409, message);
    throw error;
  }
}

// A changed local plan after external success needs a new explicit review. Never
// silently overwrite it, discard the external success, or resend the Google write.
export async function reviewCalendarRecovery(context: CalendarContext, config: GoogleConfig, actionId: string) {
  requireCalendarWrite(context);
  const { db, member, recipientId } = context;
  const action = await db.prepare("SELECT * FROM calendar_actions WHERE id=? AND recipient_id=? AND member_id=? AND status='uncertain' AND kind='reschedule'").bind(actionId, recipientId, member.memberId).first<ActionRow>();
  if (!action) throw new AppError('action_not_found', 409, 'Choose an incomplete reschedule to review.');
  const connection = await requireConnection(context);
  if (connection.id !== action.connection_id) throw new AppError('account_changed', 409, 'Reconnect the original Google account.');
  const payload = JSON.parse(action.payload_json) as CalendarAction['payload'];
  const event = await getGoogleEvent(await accessToken(db, config, connection), payload.calendarId, payload.eventId);
  if (event?.status === 'cancelled' || event?.extendedProperties?.private?.caresteadActionId !== action.id || Date.parse(event?.start?.dateTime || '') !== Date.parse(payload.start) || Date.parse(event?.end?.dateTime || '') !== Date.parse(payload.end)) throw new AppError('calendar_changed', 409, 'The approved time could not be confirmed in Google. Review the Google event before recovering this change.');
  payload.googleConfirmed = true;
  payload.carePlan = await calendarCarePlan(db, recipientId, member.memberId, payload.taskId, payload.start, payload.end, payload.timeZone);
  const updated = await db.prepare("UPDATE calendar_actions SET payload_json=?,error=?,updated_at=? WHERE id=? AND status='uncertain' AND payload_json=?").bind(JSON.stringify(payload), 'Google Calendar is updated. Review the remaining care changes below, then approve to finish.', new Date().toISOString(), action.id, action.payload_json).run();
  if (!updated.meta.changes) throw new AppError('action_in_progress', 409, 'This recovery changed in another session. Refresh and review it again.');
}

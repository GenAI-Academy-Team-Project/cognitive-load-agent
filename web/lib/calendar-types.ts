export type CalendarCareChange = {
  taskId: string; title: string; owner: string; before: string; after: string;
  signature: string; status: string;
};
export type CalendarCarePlan = {
  changes: CalendarCareChange[];
  conflicts: string[];
};
export type CalendarDraft = {
  title: string;
  start: string;
  end: string;
  timeZone: string;
  location: string;
  attendees: string[];
  reminderMinutes: number;
};
export type CalendarAction = {
  id: string;
  kind: 'create' | 'reschedule' | 'cancel';
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'uncertain' | 'rejected';
  payload: CalendarDraft & { taskId: string; appointmentId: string; eventId: string; etag: string; calendarId: string; calendarName: string; organizer: string; carePlan?: CalendarCarePlan; googleConfirmed?: boolean };
  error: string | null;
  htmlLink: string | null;
};
export type CalendarAppointment = {
  id: string; task_id: string; member_id: string; connection_id: string; calendar_id: string;
  event_id: string; title: string; start_at: string; end_at: string; timezone: string;
  location: string; attendees_json: string; reminder_minutes: string; status: string; html_link: string;
  canManage?: boolean;
};
export type CalendarState = {
  capabilities?: { linkedRescheduling: boolean };
  configured: boolean;
  connection: { email: string; status: string } | null;
  binding: { calendar_id: string; calendar_name: string } | null;
  calendars: { id: string; summary: string; timeZone?: string }[];
  appointments: CalendarAppointment[];
  actions: CalendarAction[];
  error?: string;
};

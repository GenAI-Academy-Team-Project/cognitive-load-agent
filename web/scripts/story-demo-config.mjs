import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const channels = ['in_app', 'email', 'sms', 'push', 'ntfy'];
export function storyConfig(env = process.env) {
  const url = new URL(env.DEMO_BASE_URL || 'https://carestead.carestead.workers.dev');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('DEMO_BASE_URL must be an HTTPS origin without credentials or a path.');
  const requested = (env.DEMO_CHANNELS || channels.join(',')).split(',').map(s => s.trim());
  if (!requested.length || requested.some(c => !channels.includes(c)) || new Set(requested).size !== requested.length) throw new Error('DEMO_CHANNELS must contain unique names: ' + channels.join(','));
  const dir = fileURLToPath(new URL(`../.playwright-runs/story-demo/${createHash('sha256').update(url.origin).digest('hex').slice(0, 16)}/`, import.meta.url));
  return { baseURL: url.origin, dir, channels: requested, day: env.DEMO_DATE || '2026-10-20', caregiverEmail: env.DEMO_CAREGIVER_EMAIL || 'deventhusiast.ailearningsupport@gmail.com', caregiverName: env.DEMO_CAREGIVER_NAME || 'Noah', ownerEmail: env.DEMO_OWNER_EMAIL || 'matvxhmt@gmail.com', guest: env.DEMO_GUEST_EMAIL || 'deventhusiast.ailearningsupport@gmail.com', image: env.DEMO_IMAGE || fileURLToPath(new URL('../../docs/samples/physiotherapy-appointment-intake.png', import.meta.url)) };
}
export function assertManifest(data, config, ownerId) {
  if (data.version !== 1 || data.baseURL !== config.baseURL || data.ownerId !== ownerId || !data.recipientId || !data.recipientName?.startsWith('Alex (story demo ')) throw new Error('Demo manifest ownership mismatch; refusing to modify data.');
}
export function notificationReadiness(prefs, requested) {
  const enabled = { in_app: true, email: prefs.emailEnabled && Boolean(prefs.email), sms: prefs.smsEnabled && Boolean(prefs.phone), push: prefs.pushEnabled, ntfy: prefs.ntfyEnabled };
  return requested.filter(c => !prefs.channels?.includes(c) || !enabled[c]);
}
export function assertOwnedAppointments(current, data) {
  if (current.actions.some(a => ['executing', 'uncertain'].includes(a.status))) throw new Error('Resolve incomplete Google actions in Calendar before cleanup.');
  for (const a of current.appointments.filter(a => a.status === 'confirmed')) {
    const attendees = JSON.parse(a.attendees_json);
    if (!Array.isArray(attendees) || attendees.length) throw new Error('Calendar guests require manual cancellation approval before cleanup.');
    if (!data.taskIds?.includes(a.task_id) || !a.canManage) throw new Error('Unowned appointment found; cancel it in Calendar before cleanup.');
  }
}

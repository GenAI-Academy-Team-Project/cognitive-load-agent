import { AppError } from './guardrails';

function partsAt(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
}

export function localInput(iso: string, timeZone: string) {
  const parts = partsAt(new Date(iso), timeZone);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// Reject DST gaps and repeated wall times rather than silently choosing an instant.
export function localToInstant(value: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new AppError('invalid_date', 400, 'Enter a complete date and time.');
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) throw new AppError('invalid_date', 400, 'Enter a valid date and time.');
  try { partsAt(new Date(wall), timeZone); } catch { throw new AppError('invalid_timezone', 400, 'Choose a valid time zone.'); }
  const offsets = new Set<number>();
  for (const delta of [-36, -12, 0, 12, 36]) {
    const instant = wall + delta * 3600000;
    offsets.add(Date.parse(`${localInput(new Date(instant).toISOString(), timeZone)}:00Z`) - instant);
  }
  const matches = [...offsets].map((offset) => new Date(wall - offset).toISOString()).filter((iso) => localInput(iso, timeZone) === value);
  if (matches.length !== 1) throw new AppError('ambiguous_date', 400, 'This time falls in a daylight-saving clock change. Choose another time or use UTC.');
  return matches[0];
}

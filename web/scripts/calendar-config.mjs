export const calendarSecretNames = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_TOKEN_KEY'];

/** Validate production configuration without printing any values. */
export function calendarSecrets(source) {
  const values = {};
  for (const name of calendarSecretNames) {
    const value = source[name];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Set ${name} before activating Google Calendar.`);
    if (value !== value.trim() || /[\r\n]/.test(value)) throw new Error(`${name} must not contain surrounding whitespace or newlines.`);
    values[name] = value;
  }
  if (!/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(values.GOOGLE_CLIENT_ID)) throw new Error('GOOGLE_CLIENT_ID must be a Google OAuth web application client ID.');
  if (!/^[a-f0-9]{64}$/i.test(values.GOOGLE_TOKEN_KEY)) throw new Error('GOOGLE_TOKEN_KEY must be a persistent 32-byte key encoded as 64 hexadecimal characters.');
  let callback;
  try { callback = new URL(values.GOOGLE_REDIRECT_URI); } catch { throw new Error('GOOGLE_REDIRECT_URI must be an absolute HTTPS callback URL.'); }
  if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== '/api/calendar/callback' || ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) {
    throw new Error('GOOGLE_REDIRECT_URI must be https://YOUR_DEPLOYED_HOST/api/calendar/callback, without credentials, query parameters, or fragments.');
  }
  return values;
}


export function apiOrigin(value, { allowLocal = false } = {}) {
  if (!value) throw new Error('Set VITE_CARESTEAD_API_ORIGIN in mobile/.env.local before building.');
  const url = new URL(value);
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('The API address must be an HTTPS origin without a path, credentials, query, or fragment.');
  }
  if (!allowLocal && (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.example.com'))) {
    throw new Error('Configure a real HTTPS backend origin before preparing the iOS app.');
  }
  return url.origin;
}

export const apiPaths = new Set([
  '/api/auth/session', '/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/sign-out', '/api/auth/guest',
  '/api/state', '/api/chat', '/api/calendar',
  '/api/auth/update-profile', '/api/auth/update-password', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/planning', '/api/agent-workflows', '/api/handover', '/api/notifications', '/api/integrations', '/api/export',
]);

// Dependency injection makes the native boundary testable without an iPhone.
export function createMobileFetch({ native, request, openCalendar, browserFetch, localOrigin, onUnauthorized }) {
  const local = new URL(localOrigin);
  return async function mobileFetch(input, init) {
    const source = input instanceof Request ? input.url : String(input);
    const url = new URL(source, localOrigin);
    // Custom schemes can report an opaque ("null") origin. Compare scheme and host explicitly.
    if (url.protocol !== local.protocol || url.host !== local.host || !url.pathname.startsWith('/api/')) {
      return browserFetch(input, init);
    }
    if (!apiPaths.has(url.pathname)) throw new Error('This API is not available in the mobile pilot.');
    const req = new Request(url, input instanceof Request ? input : undefined);
    const merged = new Request(req, init);
    const method = merged.method;
    if (!['GET', 'POST'].includes(method)) throw new Error('Unsupported mobile request method.');
    if (merged.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
    let response;
    if (!native) {
      response = await browserFetch(input, init);
    } else {
      const contentType = merged.headers.get('Content-Type') || '';
      const multipart = method === 'POST' && contentType.startsWith('multipart/form-data;');
      if (multipart && url.pathname !== '/api/agent-workflows') throw new Error('Uploads are only supported for document intake.');
      let body;
      if (multipart) {
        const bytes = new Uint8Array(await merged.arrayBuffer());
        if (bytes.length > 6 * 1024 * 1024) throw new Error('Choose a file no larger than 5 MB.');
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        body = btoa(binary);
      } else body = method === 'POST' ? await merged.text() : undefined;
      if (url.pathname === '/api/calendar' && body && JSON.parse(body).action === 'connect') {
        await openCalendar(JSON.parse(body).recipientId);
        return Response.json({ error: 'Connect Google in your browser using the same Carestead account, then return here and tap Refresh.' }, { status: 409 });
      }
      // Native code supplies Origin, handles cookies, restricts destinations, and refuses redirects.
      // No session cookie or provider credentials cross the JavaScript bridge.
      const result = await request({ path: url.pathname + url.search, method, body, ...(multipart ? { contentType, bodyEncoding: 'base64' } : {}) });
      if (merged.signal.aborted) throw new DOMException('Request cancelled', 'AbortError');
      response = new Response(result.data, { status: result.status, headers: { 'Content-Type': 'application/json' } });
    }
    if (response.status === 401 && !url.pathname.startsWith('/api/auth/')) onUnauthorized();
    return response;
  };
}

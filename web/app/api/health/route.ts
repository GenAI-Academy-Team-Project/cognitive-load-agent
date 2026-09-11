import { env } from 'cloudflare:workers';

export const runtime = 'edge';

export async function GET() {
  const checkedAt = new Date().toISOString();
  try { await env.DB.prepare('SELECT 1 ok').first(); return Response.json({ status: 'ok', database: 'reachable', checkedAt }, { headers: { 'cache-control': 'no-store' } }); }
  catch { return Response.json({ status: 'degraded', database: 'unreachable', checkedAt }, { status: 503, headers: { 'cache-control': 'no-store' } }); }
}

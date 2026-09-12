import { env } from 'cloudflare:workers';
import { ensureDatabase } from '@/db/bootstrap';
import { requireMembership } from '@/lib/auth';
import { errorResponse } from '@/lib/guardrails';
import { integrationSettings, setIntegration } from '@/lib/integration-settings';

export const runtime = 'edge';
async function handle(request: Request) {
  try {
    await ensureDatabase(env.DB);
    const auth = await requireMembership(env.DB, request);
    if ('error' in auth) return auth.error;
    if (request.method === 'POST') {
      const body = await request.json() as { id?: unknown; enabled?: unknown };
      await setIntegration(env.DB, env, body.id, body.enabled, auth.member);
    }
    return Response.json({ integrations: await integrationSettings(env.DB, env), canManage: auth.member.role === 'owner' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error, crypto.randomUUID()); }
}
export const GET = handle;
export const POST = handle;

import { checkOrigin, sessionToken, tokenHash } from '@/lib/sessions';

export type CareRole = 'owner' | 'caregiver' | 'viewer';

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  isGuest?: boolean;
};

export type CareMembership = AuthenticatedUser & {
  memberId: string;
  role: CareRole;
  status: string;
};

export async function authenticatedUser(db: D1Database, request: Request): Promise<AuthenticatedUser | null> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const guest = await db.prepare("SELECT 1 FROM auth_sessions WHERE token_hash=? AND account_id='guest' AND expires_at>?").bind(tokenHash(token), new Date().toISOString()).first();
  if (guest) return { id: 'guest', email: '', displayName: 'Guest', isGuest: true };
  return db.prepare('SELECT a.id, a.email, a.display_name displayName FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(tokenHash(token), new Date().toISOString()).first<AuthenticatedUser>();
}

export async function requireMembership(db: D1Database, request: Request, publicUrl: string | undefined) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) checkOrigin(request, publicUrl);
  const user = await authenticatedUser(db, request);
  if (!user) return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) } as const;

  if (user.isGuest) return { error: Response.json({ error: 'Guest access is limited to the sample dashboard. Sign in to access your care circle.' }, { status: 403 }) } as const;

  const member = await db
    .prepare("SELECT id AS memberId, user_id AS id, email, display_name AS displayName, role, status FROM care_circle_members WHERE user_id = ? AND status = 'active'")
    .bind(user.id)
    .first<CareMembership>();

  if (!member) return { error: Response.json({ error: 'You are not a member of this care circle' }, { status: 403 }) } as const;
  return { member: { ...member, id: user.id, email: user.email, displayName: member.displayName || user.displayName } } as const;
}

export function canWrite(role: CareRole) {
  return role === 'owner' || role === 'caregiver';
}

export function isOwner(role: CareRole) {
  return role === 'owner';
}

export type CareRole = 'owner' | 'caregiver' | 'viewer';

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
};

export type CareMembership = AuthenticatedUser & {
  memberId: string;
  role: CareRole;
  status: string;
};

function displayNameFromEmail(email: string) {
  const local = email.split('@')[0] || 'Caregiver';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function authenticatedUser(request: Request): AuthenticatedUser | null {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  const host = request.headers.get('host') ?? '';
  if (id && email) {
    return { id, email: email.toLowerCase(), displayName: displayNameFromEmail(email) };
  }
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    const testId = request.headers.get('x-carestead-test-user-id');
    const testEmail = request.headers.get('x-carestead-test-user-email');
    if (testId && testEmail) {
      return { id: testId, email: testEmail.toLowerCase(), displayName: displayNameFromEmail(testEmail) };
    }
    return { id: 'local-demo-owner', email: 'frincy@example.test', displayName: 'Frincy' };
  }
  return null;
}

export async function requireMembership(db: D1Database, request: Request) {
  const user = authenticatedUser(request);
  if (!user) return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) } as const;

  let member = await db
    .prepare("SELECT id AS memberId, user_id AS id, email, display_name AS displayName, role, status FROM care_circle_members WHERE user_id = ? AND status = 'active'")
    .bind(user.id)
    .first<CareMembership>();

  if (!member) {
    const invited = await db
      .prepare("SELECT id AS memberId, user_id AS id, email, display_name AS displayName, role, status FROM care_circle_members WHERE lower(email) = lower(?) AND status = 'invited'")
      .bind(user.email)
      .first<CareMembership>();
    if (invited) {
      await db.prepare("UPDATE care_circle_members SET user_id = ?, status = 'active', updated_at = ? WHERE id = ?")
        .bind(user.id, new Date().toISOString(), invited.memberId).run();
      member = { ...invited, id: user.id, status: 'active' };
    }
  }

  if (!member) {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM care_circle_members').first<{ count: number }>();
    if ((count?.count ?? 0) === 0) {
      const now = new Date().toISOString();
      const memberId = crypto.randomUUID();
      await db.prepare('INSERT INTO care_circle_members VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(memberId, 'household-demo', user.id, user.email, user.displayName, 'owner', 'active', now, now).run();
      member = { ...user, memberId, role: 'owner', status: 'active' };
    }
  }

  if (!member) return { error: Response.json({ error: 'You are not a member of this care circle' }, { status: 403 }) } as const;
  return { member: { ...member, id: user.id, email: user.email, displayName: member.displayName || user.displayName } } as const;
}

export function canWrite(role: CareRole) {
  return role === 'owner' || role === 'caregiver';
}

export function isOwner(role: CareRole) {
  return role === 'owner';
}

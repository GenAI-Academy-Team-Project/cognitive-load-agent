import { Check, Circle } from 'lucide-react';
import { passwordRequirements } from '@/lib/password-policy';

export function PasswordRules({ id, password, confirmation, currentPassword }: {
  id: string;
  password: string;
  confirmation?: string;
  currentPassword?: string;
}) {
  const rules = confirmation !== undefined
    ? [{ label: 'Passwords match', met: password.length > 0 && confirmation === password }]
    : [
        ...passwordRequirements(password),
        ...(currentPassword !== undefined ? [{ label: 'Different from your current password', met: currentPassword.length > 0 && password.length > 0 && password !== currentPassword }] : []),
      ];
  return <ul id={id} className="space-y-1 text-xs" aria-live="polite" aria-atomic="true">
    {rules.map(({ label, met }) => <li key={label} className={`flex items-center gap-2 ${met ? 'text-primary' : 'text-muted-foreground'}`}>
      {met ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Circle className="size-3.5 shrink-0" aria-hidden="true" />}
      <span><span className="sr-only">{met ? 'Met: ' : 'Not yet met: '}</span>{label}</span>
    </li>)}
  </ul>;
}

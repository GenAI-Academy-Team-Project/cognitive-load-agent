export const passwordPolicyMessage = 'Use between 12 and 128 characters, including at least one uppercase letter, one lowercase letter, one number, and one special character.';

export function passwordRequirements(password: string) {
  return [
    { label: 'At least 12 characters', met: password.length >= 12 && password.length <= 128 },
    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
    { label: 'At least one number', met: /[0-9]/.test(password) },
    { label: 'At least one special character', met: /[\p{P}\p{S}]/u.test(password) },
  ];
}

export function meetsPasswordPolicy(password: unknown): password is string {
  return typeof password === 'string' && passwordRequirements(password).every(rule => rule.met);
}

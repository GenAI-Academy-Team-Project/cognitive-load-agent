import { test, expect } from '@playwright/test';
import { meetsPasswordPolicy, passwordRequirements } from '../lib/password-policy';

test('accepts passwords meeting every rule at the length boundaries', () => {
  expect(meetsPasswordPolicy('Abcdefghij1!')).toBe(true);
  expect(meetsPasswordPolicy('Aa1!' + 'a'.repeat(124))).toBe(true);
  expect(passwordRequirements('Abcdefghij1!').every(rule => rule.met)).toBe(true);
});

test('rejects each missing requirement and invalid values', () => {
  for (const password of [
    'Abcdefghi1!', 'Aa1!' + 'a'.repeat(125),
    'abcdefghij1!', 'ABCDEFGHIJ1!', 'Abcdefghijk!', 'Abcdefghijk1',
    'Abcdefghij1 ', 'Abcdefghij1\n', '', null, undefined, 123,
  ]) expect(meetsPasswordPolicy(password)).toBe(false);
});

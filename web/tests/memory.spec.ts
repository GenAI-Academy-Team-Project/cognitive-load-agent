import type { MemoryRecord } from '../lib/types';
import { expect, test } from '@playwright/test';


test('chat memory requires review, survives reload, and respects corrections and archival', async ({ page, baseURL }) => {
  const origin = baseURL!;
  await page.goto('/');
  const initial = await (await page.request.get('/api/state')).json();
  const recipientId = initial.selectedRecipient.id;
  const post = (data: object) => page.request.post('/api/chat', { headers: { Origin: origin }, data: { recipientId, ...data } });
  const statePost = (data: object) => page.request.post('/api/state', { headers: { Origin: origin }, data: { recipientId, ...data } });
  const value = 'Alex prefers quiet afternoon visits by the garden.';
  await page.getByRole('button', { name: /ask carestead about/i }).click();
  await page.getByRole('textbox', { name: /message carestead/i }).fill(`Remember that ${value}`);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('button', { name: 'Save as trusted fact' })).toBeVisible();
  const before = await (await page.request.get(`/api/state?recipientId=${recipientId}`)).json();
  expect(before.memories.some((m: MemoryRecord) => m.value === value)).toBe(false);
  await page.getByRole('button', { name: 'Save as trusted fact' }).click();
  await expect(page.getByText('The verified fact was saved for this care circle and is available in future conversations.')).toBeVisible();
  await page.reload();
  const recalled = await (await post({ action: 'message', message: 'What visits does Alex prefer?' })).json();
  expect(recalled.messages.at(-1).content).toContain(value);
  expect(recalled.messages.at(-1).evidence[0].label).toBe('Verified fact');
  const state = await (await page.request.get(`/api/state?recipientId=${recipientId}`)).json();
  const memory = state.memories.find((m: MemoryRecord) => m.value === value);
  expect(memory.status).toBe('verified');
  expect(memory.source).toContain('Chat message');
  expect((await statePost({ action: 'update_memory', id: memory.id, value: 'Alex prefers short morning visits.', source: 'Caregiver correction', status: 'verified' })).ok()).toBe(true);
  const corrected = await (await post({ action: 'message', message: 'What visits does Alex prefer?' })).json();
  expect(corrected.messages.at(-1).content).toContain('short morning visits');
  expect(corrected.messages.at(-1).content).not.toContain(value);
  expect((await statePost({ action: 'archive_memory', id: memory.id })).ok()).toBe(true);
  const archived = await (await post({ action: 'message', message: 'What visits does Alex prefer?' })).json();
  expect(archived.messages.at(-1).content).not.toContain('short morning visits');
});

test('rejecting a suggestion keeps it out of shared memory and unknown actions cannot approve', async ({ request, baseURL }) => {
  const origin = baseURL!;
  const state = await (await request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  const post = (data: object) => request.post('/api/chat', { headers: { Origin: origin }, data: { recipientId, ...data } });
  const proposed = await (await post({ action: 'message', message: 'Remember that quiet music is preferred during visits.' })).json();
  const actionId = proposed.messages.at(-1).action.id;
  expect((await post({ action: 'unexpected_action', actionId })).status()).toBe(400);
  expect((await post({ action: 'reject_action', actionId })).ok()).toBe(true);
  expect((await post({ action: 'approve_action', actionId })).status()).toBe(409);
  const after = await (await request.get(`/api/state?recipientId=${recipientId}`)).json();
  expect(after.memories.some((m: MemoryRecord) => m.value === 'quiet music is preferred during visits.')).toBe(false);
  expect((await post({ action: 'message', recipientId: 'unauthorized-recipient', message: 'What do you remember?' })).status()).toBe(403);
});

test('review-due facts never appear as trusted chat evidence', async ({ request, baseURL }) => {
  const origin = baseURL!;
  const state = await (await request.get('/api/state')).json();
  const recipientId = state.selectedRecipient.id;
  await request.post('/api/state', { headers: { Origin: origin }, data: { recipientId, action: 'add_memory', value: 'Unverified lavender greeting preference', source: 'Needs confirmation' } });
  const response = await request.post('/api/chat', { headers: { Origin: origin }, data: { recipientId, action: 'message', message: 'What lavender greeting preference is saved?' } });
  const chat = await response.json();
  expect(JSON.stringify(chat.messages.at(-1).evidence)).not.toContain('Unverified lavender');
});

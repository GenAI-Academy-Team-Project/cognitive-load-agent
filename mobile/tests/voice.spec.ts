import { test, expect } from '@playwright/test';
import { inviteCaregiver, secondRecipient } from './accounts';

for (const width of [390, 1280]) {
test(`voice at ${width}px navigates, clarifies, requires confirmation, executes and cancels through the real API`, async ({ page, baseURL }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    const scope = window as unknown as { SpeechRecognition: unknown; voiceText: string; voiceDelay?: number };
    scope.SpeechRecognition = class {
      onresult?: (event: unknown) => void;
      start() { setTimeout(() => this.onresult?.({ results: [[{ transcript: scope.voiceText }]] }), scope.voiceDelay || 20); }
      abort() {}
    };
  });
  const email = `voice-${Date.now()}@example.test`;
  const invitation = await inviteCaregiver(baseURL!, email, 'Voice Owner');
  await page.goto(`/sign-up#invitation=${invitation}`);
  await page.getByLabel('Your name').fill('Voice Owner');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Carestead voice test password 2026!');
  await page.getByLabel('Confirm password').fill('Carestead voice test password 2026!');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const mic = page.getByRole('button', { name: 'Talk to Carestead', exact: true });
  await expect(mic).toBeVisible();
  async function say(text: string) {
    await page.evaluate(value => { (window as unknown as { voiceText: string }).voiceText = value; }, text);
    await mic.click();
  }
  const panel = page.getByRole('region', { name: 'Carestead voice assistant' });
  await say('Open my calendar');
  await expect(page.getByRole('heading', { name: 'Care appointments', exact: true })).toBeVisible();
  await say('What needs attention today?');
  await expect(panel.getByRole('status')).not.toContainText('Checking your request');
  await expect(panel.getByRole('status')).not.toContainText('Listening');
  await say('Create a reminder to call the care team tomorrow at nine');
  await expect(panel.getByRole('status')).toContainText('What date and time?');
  await say('tomorrow at nine AM');
  await expect(panel.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  const before = await (await page.request.get('/api/state')).json();
  const initialCount = before.tasks.length;
  await say('Confirm');
  await expect(panel.getByRole('button', { name: 'Confirm', exact: true })).toBeHidden();
  await expect(mic).toBeVisible();
  const after = await (await page.request.get('/api/state')).json();
  expect(after.tasks.length).toBe(initialCount + 1);
  await say('Create a reminder to cancel tomorrow at ten AM');
  await expect(panel.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  await say('Cancel');
  await expect(panel.getByRole('status')).toContainText('cancelled');
  expect((await (await page.request.get('/api/state')).json()).tasks.length).toBe(initialCount + 1);
  await say('Create a reminder tomorrow at ten AM');
  await expect(panel.getByRole('status')).toContainText('What should the reminder be for?');
  await say('Call the pharmacy');
  await expect(panel.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  const second = await secondRecipient(baseURL!, email);
  await page.getByRole('button', { name: 'Refresh care plan' }).click();
  await expect(page.getByLabel('Care recipient')).toBeEnabled();
  await page.getByLabel('Care recipient').selectOption(second.data.selectedRecipient.id);
  await expect(mic).toBeVisible();
  await say('Confirm');
  await expect(panel.getByRole('status')).toContainText('no voice action waiting');
  const historyBefore = await (await page.request.get(`/api/chat?recipientId=${second.data.selectedRecipient.id}`)).json();
  await page.evaluate(() => { (window as unknown as { voiceDelay: number }).voiceDelay = 700; });
  await say('Run care check');
  await page.getByRole('button', { name: 'Stop voice listening' }).click();
  await page.waitForTimeout(900); // allow the discarded recognition callback to arrive
  const historyAfter = await (await page.request.get(`/api/chat?recipientId=${second.data.selectedRecipient.id}`)).json();
  expect(historyAfter.messages.length).toBe(historyBefore.messages.length);
  await page.evaluate(() => { const scope = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }; delete scope.SpeechRecognition; delete scope.webkitSpeechRecognition; });
  await mic.click();
  await expect(panel.getByRole('status')).toContainText('unavailable in this browser');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/voice-${width}.png`, fullPage: true });
});

}

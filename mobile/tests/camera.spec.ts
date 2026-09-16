import { test, expect } from '@playwright/test';
import { inviteCaregiver } from './accounts';

test('document intake offers camera capture and existing uploads with the same review gate', async ({ page, baseURL }) => {
  const email = `camera-${Date.now()}@example.test`;
  const password = 'Carestead camera test 2026!';
  const invitation = await inviteCaregiver(baseURL!, email, 'Camera Tester');
  const response = await page.request.post('/api/auth/sign-up', {
    headers: { Origin: baseURL! },
    data: { displayName: 'Camera Tester', email, invitation, password, confirmPassword: password },
  });
  expect(response.ok(), await response.text()).toBe(true);
  await page.goto('/?view=Care%20Organizer');
  await page.getByRole('button', { name: 'Review a document', exact: true }).click();
  const camera = page.locator('#care-document-camera');
  await expect(camera).toHaveAttribute('capture', 'environment');
  await expect(camera).toHaveAttribute('accept', 'image/*');
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take a photo', exact: true }).click();
  await (await picker).setFiles({ name: 'camera.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('test camera image') });
  await expect(page.getByText('Selected file: camera.jpg', { exact: true })).toBeVisible();
  const extract = page.getByRole('button', { name: 'Extract reviewable items' });
  await expect(extract).toBeDisabled();
  await page.getByLabel(/I confirm I have permission/).check();
  await expect(extract).toBeEnabled();
  // Cancelling camera selection leaves the prior choice intact.
  await camera.setInputFiles([]);
  await expect(page.getByText('Selected file: camera.jpg', { exact: true })).toBeVisible();
  const upload = page.getByLabel(/^Document or image/);
  await expect(upload).not.toHaveAttribute('capture');
  await upload.setInputFiles({ name: 'existing.png', mimeType: 'image/png', buffer: Buffer.from('test existing image') });
  await expect(page.getByText('Selected file: existing.png', { exact: true })).toBeVisible();
  let submitted: { file: { name: string }; processingConsent: string } | undefined;
  await page.route('**/api/agent-workflows', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 422, json: { error: 'Test review response' } });
  });
  await extract.click();
  await expect(page.getByText('Test review response', { exact: true })).toBeVisible();
  expect(submitted?.file.name).toBe('existing.png');
  expect(submitted?.processingConsent).toBe('true');
});

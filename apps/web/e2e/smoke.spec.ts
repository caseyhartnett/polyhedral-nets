import { expect, test } from '@playwright/test';

test('landing page renders core CTA content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Design printable 3D forms in seconds.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open blank workspace' })).toBeVisible();
});

test('app flow generates outputs and can download zip', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Generate Files' }).click();

  await expect(page.getByText(/Files ready:/)).toBeVisible();
  await expect(page.getByAltText('Generated SVG template')).toBeVisible();

  const zipDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download ZIP/ }).click();
  const download = await zipDownload;

  expect(download.suggestedFilename().endsWith('.zip')).toBeTruthy();
});

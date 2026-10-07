import { expect, test } from '@playwright/test';
import { makeApiDatasetFixture } from './fixtures/api-dataset';

const fixture = makeApiDatasetFixture();

test.beforeEach(async ({ page }) => {
  await page.route('https://api.skynetcountdown.org/dataset', (route) => route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } }));
});

test('soundtrack is opt-in, stays playing across routes, and starts silent after reload', async ({ page }) => {
  const mediaRequests: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('.mp3')) mediaRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toBeVisible();
  const toggle = page.getByRole('switch', { name: 'Background soundtrack' });
  const audio = page.locator('audio');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(audio).not.toHaveAttribute('src');
  expect(mediaRequests).toHaveLength(0);
  await expect(page.locator('#soundtrack-credit')).toContainText('Kepler’s Harmony of the Worlds · Laurie Spiegel');
  await expect(page.locator('#soundtrack-credit')).toContainText('℗ 2012 Laurie Spiegel Publishing (ASCAP)');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toContainText('ON');
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
  expect(await audio.evaluate((element: HTMLAudioElement) => ({ paused: element.paused, loop: element.loop, volume: element.volume }))).toEqual({ paused: false, loop: true, volume: 0.2 });

  const beforeNavigation = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await expect(page.locator('.archive-row').first()).toBeVisible();
  await page.getByRole('link', { name: 'Methodology', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThanOrEqual(beforeNavigation);

  await toggle.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toContainText('ON');
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  const pausedAt = await audio.evaluate((element: HTMLAudioElement) => element.currentTime);
  await toggle.press('Space');
  await expect(toggle).toContainText('ON');
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(pausedAt);
  await audio.evaluate((element: HTMLAudioElement) => element.pause());
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.click();
  await expect(toggle).toContainText('ON');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Background soundtrack' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('audio')).not.toHaveAttribute('src');
});

test('failed audio shows a retry message and can recover', async ({ page }) => {
  let failAudio = true;
  await page.route(/\.mp3$/, (route) => failAudio ? route.abort('failed') : route.continue());
  await page.goto('/');
  const toggle = page.getByRole('switch', { name: 'Background soundtrack' });
  await toggle.click();
  await expect(page.getByRole('status')).toHaveText('Audio unavailable. Try again.');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const message = await page.getByRole('status').boundingBox();
  const header = await page.locator('.site-header').boundingBox();
  const content = await page.locator('main').boundingBox();
  expect(message!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(message!.y + message!.height).toBeLessThanOrEqual(content!.y);
  failAudio = false;
  await toggle.click();
  await expect(toggle).toContainText('ON');
  await expect(page.getByRole('status')).toBeEmpty();
});

test('switching off while the track loads cancels playback', async ({ page }) => {
  let releaseAudio = () => {};
  const gate = new Promise<void>((resolve) => { releaseAudio = resolve; });
  await page.route(/\.mp3$/, async (route) => { await gate; await route.continue(); });
  await page.goto('/');
  const toggle = page.getByRole('switch', { name: 'Background soundtrack' });
  const request = page.waitForRequest(/\.mp3$/);
  await toggle.click();
  await request;
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  releaseAudio();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.locator('audio').evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await expect(page.getByRole('status')).toBeEmpty();
  await toggle.click();
  await expect(toggle).toContainText('ON');
});

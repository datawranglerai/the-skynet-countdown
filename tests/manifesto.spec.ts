import { expect, test } from '@playwright/test';
import { makeApiDatasetFixture } from './fixtures/api-dataset';

const fixture = makeApiDatasetFixture();

const manifestoParagraphs = [
  "AI is exciting and terrifying in equal measure, with potential to both kill and cure us all. No one sane is building Skynet on purpose. There's no lair, white cat, glowing red eye, or master plan. Well-governed, controllable AI could be humanity's saviour. While having no evil master plan is reassuring, the lack of global AI governance could also be our existential undoing.",
  'In a world where the AI frontier labs are racing each other to create artificial deities, they are both begging for investment and pleading for regulation against their own self-interest. In the same world where Washington and Beijing are competing for unilateral advantage, fighting over chips and vying for a new world order, the middle powers are poised to exploit any slip-up. As we lurch towards ever more isolationist, protectionist geopolitics, humanity is the one thing nobody is protecting, and no one has a hand on the brake.',
  "Meanwhile in boardrooms and bedrooms across the world, we're all in it for ourselves. Founders chasing infamy. Investors chasing unicorns. Managers chasing a raise. Devs chasing GitHub stars and everyone else chasing the pack. While hype cycles fuel the chase, we just ship the tickets in front of us because the rent won't pay itself.",
  'Not every idea has merit, but every decision makes sense, in isolation, only to the person making it. Building the boss\'s vanity agent. Bringing clients\' bad ideas to life just to keep the pipeline alive. Skipping the red-teaming to hit the launch date. Giving the agent prod credentials because the demo needs them. Parking safety in the backlog under "nice to have".',
  'Add it all up and we’re counting down to the end of our time. We tend to leave a wake of destruction behind us, but thankfully we haven’t yet gone all the way. Even so, our hands are already full, limiting the damage from some pretty big problems: nuclear war and climate change. Uncontrollable AI will be one disaster too far. And time is running out to turn back the clock.',
  "So we're keeping count of every frontier model development, release and incident. Reckless releases, skipped evals, over-privileged agents: every act of irresponsibility moves the hand towards midnight. Every responsible call winds it back. Two minutes to midnight is the event horizon, the point of no return. Midnight is when we've lost control and AI has become our overlord.",
  "Of course there'll be events we cannot see, and some that only reveal themselves when it's too late. We don't know what we don't know, but what we do know we can track and trace. The Skynet Countdown, our AI control and consequences clock if you like, is our contribution to the case for human responsibility over individual and collective irresponsibility. IMD's AI Safety Clock already puts us at fifteen metaphorical minutes to midnight. Take away the last two, the point of no return, and that leaves an unlucky thirteen minutes of theoretical time we really shouldn't be playing with.",
] as const;

test.beforeEach(async ({ page }) => {
  await page.route('https://api.skynetcountdown.org/dataset', (route) =>
    route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } }));
});

test('presents the manifesto verbatim and exposes it in shared navigation', async ({ page }) => {
  await page.goto('/');

  const headerLinks = page.locator('.site-header nav a');
  await expect(headerLinks).toHaveText(['The clock', 'Incident archive', 'Methodology', 'Manifesto']);
  const manifestoLink = page.getByRole('link', { name: 'Manifesto', exact: true });
  await manifestoLink.focus();
  await manifestoLink.press('Enter');

  await expect(page).toHaveURL(/#\/manifesto$/);
  await expect(page).toHaveTitle('The Manifesto | The Skynet Countdown');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(manifestoLink).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.footer-links').getByRole('link', { name: 'The manifesto', exact: true })).toHaveAttribute('href', '#/manifesto');

  const article = page.locator('article[aria-labelledby]');
  const labelledBy = await article.getAttribute('aria-labelledby');
  expect(labelledBy).toBeTruthy();
  await expect(article.locator(`h1#${labelledBy}`)).toHaveCount(1);
  await expect(article.getByRole('heading', { level: 1 })).toHaveText('The future is not set.');
  await expect(article.getByRole('heading', { level: 2 })).toHaveText('With great power comes great irresponsibility.');
  await expect(article.locator('p')).toHaveText(manifestoParagraphs);
});

test('keeps the static manifesto available when the incident API fails', async ({ page }) => {
  await page.unroute('https://api.skynetcountdown.org/dataset');
  await page.route('https://api.skynetcountdown.org/dataset', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }));

  await page.goto('/#/manifesto');
  await expect(page.getByRole('heading', { level: 1, name: 'The future is not set.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Couldn’t load the incident record.' })).toHaveCount(0);
});

test('does not interrupt manifesto reading when the initial dataset arrives late', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let releaseDataset = () => {};
  const datasetGate = new Promise<void>((resolve) => { releaseDataset = resolve; });
  await page.unroute('https://api.skynetcountdown.org/dataset');
  await page.route('https://api.skynetcountdown.org/dataset', async (route) => {
    await datasetGate;
    await route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } });
  });

  const datasetResponse = page.waitForResponse('https://api.skynetcountdown.org/dataset');
  await page.goto('/#/manifesto', { waitUntil: 'domcontentloaded' });
  const finalParagraph = page.locator('article[aria-labelledby] p').last();
  await expect(finalParagraph).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await finalParagraph.evaluate((element: HTMLParagraphElement) => {
    element.tabIndex = -1;
    element.scrollIntoView({ block: 'center' });
    element.focus({ preventScroll: true });
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const readingPosition = await page.evaluate(() => window.scrollY);
  expect(readingPosition).toBeGreaterThan(0);
  await expect(finalParagraph).toBeFocused();

  releaseDataset();
  await datasetResponse;
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  await expect(finalParagraph).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(readingPosition, 0);
});

test('keeps all manifesto navigation and prose within the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/manifesto');
  const links = page.locator('.site-header nav a');

  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    await expect(links).toHaveCount(4);
    for (const link of await links.all()) {
      const box = await link.boundingBox();
      expect(box, `Navigation link is laid out at ${width}px`).not.toBeNull();
      expect(box!.x, `Navigation link starts within ${width}px`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `Navigation link ends within ${width}px`).toBeLessThanOrEqual(width + 1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      `No horizontal overflow at ${width}px`,
    ).toBe(true);
  }

  await expect(page.locator('article[aria-labelledby]')).toBeVisible();
});

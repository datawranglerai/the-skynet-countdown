import { expect, test, type Page } from '@playwright/test';
import { makeApiDatasetFixture } from './fixtures/api-dataset';

const SITE = 'https://skynetcountdown.org';
const SCRIPT = 'https://gc.zgo.at/count.js';
const REPOSITORY = '/github.com/datawranglerai/skynet-countdown-scoring-methodology';
const fixture = makeApiDatasetFixture();

interface Hit {
  path: string;
  title: string;
  referrer: string;
  event?: boolean;
  no_session?: boolean;
}

type AnalyticsWindow = Window & { analyticsHits?: Hit[] };

const mockScript = `
  window.analyticsHits = [];
  window.goatcounter = { count: function(hit) { window.analyticsHits.push(hit); } };
`;

async function hits(page: Page) {
  return page.evaluate(() => (window as AnalyticsWindow).analyticsHits ?? []);
}

async function pageviews(page: Page) {
  return (await hits(page)).filter((hit) => !hit.event);
}

test.beforeEach(async ({ context, page }) => {
  // Exercise the production hostname guard using only our local build and fixtures.
  await context.route(`${SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4173${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await context.route('https://api.skynetcountdown.org/**', (route) => route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } }));
  await context.route('https://skynetcountdown.goatcounter.com/**', (route) => route.abort());
  await page.route(SCRIPT, (route) => route.fulfill({ body: mockScript, contentType: 'text/javascript' }));
});

test('counts hash pages once, including back navigation, without counting refreshes or section jumps', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('.clock-digits')).toBeVisible();
  const script = page.locator('script[data-goatcounter]');
  await expect(script).toHaveCount(1);
  await expect(script).toHaveAttribute('data-goatcounter', 'https://skynetcountdown.goatcounter.com/count');
  await expect(script).toHaveAttribute('data-goatcounter-settings', '{"no_onload":true,"no_events":true}');
  await expect.poll(() => pageviews(page)).toHaveLength(1);

  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await page.getByRole('link', { name: 'Methodology', exact: true }).click();
  await page.evaluate(() => { window.location.hash = '/methodology/event-horizon'; });
  await expect(page.locator('#event-horizon')).toBeFocused();
  await expect.poll(() => pageviews(page)).toHaveLength(3);
  const refreshed = page.waitForResponse('https://api.skynetcountdown.org/dataset');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await page.goBack(); // The same methodology page, before the section jump.
  await page.goBack(); // Archive.
  await expect.poll(async () => (await pageviews(page)).map((hit) => hit.path)).toEqual(['/', '/#/incidents', '/#/methodology', '/#/incidents']);
  expect((await pageviews(page)).map((hit) => hit.title)).toEqual([
    'The future is not set. | The Skynet Countdown',
    'The Incident Archive | The Skynet Countdown',
    'The Methodology | The Skynet Countdown',
    'The Incident Archive | The Skynet Countdown',
  ]);
});

test('queues the original titles and referrers when the script loads after several navigations', async ({ page }) => {
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route(SCRIPT, async (route) => {
    await ready;
    await route.fulfill({ body: mockScript, contentType: 'text/javascript' });
  });
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.clock-digits')).toBeVisible();
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await page.getByRole('link', { name: 'Methodology', exact: true }).click();
  await expect(page.locator('.method-page')).toBeVisible();
  expect(await hits(page)).toEqual([]);
  release();
  await expect.poll(() => pageviews(page)).toHaveLength(3);
  expect((await pageviews(page)).map(({ path, title, referrer }) => ({ path, title, referrer }))).toEqual([
    { path: '/', title: 'The future is not set. | The Skynet Countdown', referrer: '' },
    { path: '/#/incidents', title: 'The Incident Archive | The Skynet Countdown', referrer: `${SITE}/` },
    { path: '/#/methodology', title: 'The Methodology | The Skynet Countdown', referrer: `${SITE}/#/incidents` },
  ]);
});

test('resolves direct incident aliases before sending one canonical report pageview', async ({ page }) => {
  const data = structuredClone(fixture);
  const incident = data.incidents[0];
  incident.routeAliases = ['old-report-link'];
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route('https://api.skynetcountdown.org/dataset', async (route) => {
    await ready;
    await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(`${SITE}/#/incidents/old-report-link`);
  expect(await pageviews(page)).toEqual([]);
  release();
  await expect(page.locator('.report-header h1')).toHaveText(incident.headline);
  await expect(page).toHaveURL(`${SITE}/#/incidents/${incident.id}`);
  await expect.poll(() => pageviews(page)).toEqual([{
    path: `/#/incidents/${incident.id}`,
    title: `${incident.headline} | The Skynet Countdown`.replaceAll('—', '|'),
    referrer: '',
  }]);
});

test('tracks report, footer, GitHub, source and download clicks with their locations', async ({ page }) => {
  await page.goto(SITE);
  await expect(page.locator('.clock-digits')).toBeVisible();
  // Keep external destinations unopened, after our delegated listener records the click.
  await page.evaluate(() => {
    const preventOutbound = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link && new URL(link.href).origin !== window.location.origin) event.preventDefault();
    };
    document.addEventListener('click', preventOutbound);
    document.addEventListener('auxclick', preventOutbound);
  });
  const github = page.locator('.manifesto-source-link');
  await github.evaluate((element: HTMLAnchorElement) => { element.href += '?private=query-value#private-fragment'; });
  await github.locator('.manifesto-github-mark').click(); // Nested SVG target.
  await page.locator('.footer-links a[target="_blank"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.footer-support').click();

  const recent = page.locator('.incident-card h3 a').first();
  const recentPath = (await recent.getAttribute('href'))!.slice(1);
  await recent.click();
  const source = page.locator('.source-link');
  const sourceUrl = new URL((await source.getAttribute('href'))!);
  await source.click();
  await page.locator('.footer-links a[href="#/incidents"]').click();
  const report = page.locator('.archive-content h2 a').first();
  const reportPath = (await report.getAttribute('href'))!.slice(1);
  await report.click();
  await page.getByRole('link', { name: 'Methodology', exact: true }).click();
  await page.getByRole('link', { name: 'Assessment CSV', exact: true }).click();
  await page.getByRole('link', { name: 'Propose a change on GitHub (opens in a new tab)', exact: true }).click();
  await page.getByRole('link', { name: 'Read the method on GitHub (opens in a new tab)', exact: true }).dispatchEvent('auxclick', { button: 1 });

  const events = (await hits(page)).filter((hit) => hit.event);
  expect(events.map((hit) => hit.path)).toEqual(expect.arrayContaining([
    `click/clock${REPOSITORY}`, `click/footer${REPOSITORY}`,
    'click/footer/buymeacoffee.com/datawranglerai',
    `click/recent-incidents${recentPath}`, `click/incident/${sourceUrl.hostname}${sourceUrl.pathname}`,
    'click/footer/incidents', `click/archive${reportPath}`,
    'click/methodology/api.skynetcountdown.org/exports/assessments.csv',
    `click/methodology${REPOSITORY}/blob/main/CONTRIBUTING.md`, `click/methodology${REPOSITORY}`,
  ]));
  expect(events.filter((hit) => hit.path === `click/clock${REPOSITORY}`)).toHaveLength(1);
  expect(events.every((hit) => hit.no_session === true)).toBe(true);
  expect(events.find((hit) => hit.path.startsWith('click/incident/'))?.referrer).toBe(`${SITE}/#${recentPath}`);
  expect(JSON.stringify(events)).not.toMatch(/private=query-value|private-fragment/);
});

test('tracks deliberate control use without recording search text or every calculator adjustment', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = async () => {};
    HTMLMediaElement.prototype.pause = () => {};
  });
  await page.goto(SITE);
  const range = page.getByLabel('EXPLORE THE RECORD', { exact: false });
  await range.focus();
  await range.press('Home');
  await range.press('ArrowRight');
  const soundtrack = page.getByRole('switch', { name: 'Background soundtrack' });
  await soundtrack.click();
  await soundtrack.click();
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await page.getByRole('button', { name: 'CRITICAL', exact: true }).click();
  await page.getByRole('combobox', { name: 'SORT BY' }).selectOption('score');
  await page.getByRole('checkbox', { name: 'Leading indicators' }).check();
  await page.getByRole('searchbox').fill('private search text');
  await page.getByRole('link', { name: 'Methodology', exact: true }).click();
  await page.locator('.method-toggle').nth(0).click();
  await page.locator('.method-toggle').nth(1).click();
  await page.getByRole('radio', { name: 'After Event Horizon', exact: true }).check();
  await page.getByRole('button', { name: 'Reset controls', exact: true }).click();
  await page.locator('#worked-example').selectOption({ index: 1 });
  const events = (await hits(page)).filter((hit) => hit.event);
  expect(events.map((hit) => hit.path)).toEqual(expect.arrayContaining([
    'timeline/explore', 'soundtrack/on', 'soundtrack/off', 'archive/severity/CRITICAL',
    'archive/sort/score', 'archive/leading/on', 'calculator/use',
    'calculator/phase/event-horizon', 'calculator/reset', 'methodology/worked-example',
  ]));
  expect(events.filter((hit) => hit.path === 'calculator/use')).toHaveLength(1);
  expect(events.filter((hit) => hit.path === 'timeline/explore')).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain('private search text');
});

test('the site keeps working when GoatCounter is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(SCRIPT, (route) => route.abort('blockedbyclient'));
  await page.goto(SITE);
  await expect(page.locator('.clock-digits')).toBeVisible();
  await page.locator('.incident-card h3 a').first().click();
  await expect(page.locator('.report-header h1')).toBeVisible();
  expect(await hits(page)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const mode of ['localhost', 'do-not-track'] as const) {
  test(`does not load GoatCounter for ${mode}`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => { if (request.url() === SCRIPT) requests.push(request.url()); });
    if (mode === 'do-not-track') {
      await page.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }));
    }
    await page.goto(mode === 'localhost' ? '/' : SITE);
    await expect(page.locator('.clock-digits')).toBeVisible();
    await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
    await expect(page.locator('.archive-row').first()).toBeVisible();
    await expect(page.locator('script[data-goatcounter]')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}

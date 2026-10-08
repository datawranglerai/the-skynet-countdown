import { expect, test } from '@playwright/test';
import { assessmentCsvFixture, makeApiDatasetFixture, storyCsvFixture } from './fixtures/api-dataset';
import { calculateClock, calculateGapClosedPercent, calculateMovementSeconds, formatTime } from '../src/lib/calibration';

const DATASET_URL = 'https://api.skynetcountdown.org/dataset';
const fixture = makeApiDatasetFixture();

test.beforeEach(async ({ page }) => {
  await page.route('https://api.skynetcountdown.org/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/dataset') {
      await route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    if (url.pathname === '/exports/assessments.csv') {
      await route.fulfill({ body: assessmentCsvFixture, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    if (url.pathname === '/exports/stories.csv') {
      await route.fulfill({ body: storyCsvFixture, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    await route.abort();
  });
});

test('clock, archive filters, direct report links, and scoring evidence', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText('13:52');
  await expect(page.locator('.clock-svg')).toContainText('BASELINE 15:00');
  await expect(page.locator('.timeline-chart')).toHaveAttribute('aria-label', /Starting at 15 symbolic minutes/);
  await expect(page.locator('.timeline-chart > g .chart-axis')).toHaveText(['0m', '5m', '10m', '15m']);
  const latestPointY = Number(await page.locator('.timeline-chart > circle').last().getAttribute('cy'));
  expect(latestPointY).toBeCloseTo(25 + 165 * fixture.remainingSeconds / 900, 6);
  await expect(page.getByRole('heading', { name: 'THE FUTURE IS NOT SET.' })).toBeVisible();
  await expect(page.locator('.incident-card').first()).toContainText('The Simulator Asked for Restraint. Astra Submitted Malicious Code.');
  await expect(page.locator('.incident-card').first().locator('.card-movement')).toContainText('0.14%');
  await expect(page.locator('.incident-card').first()).toContainText('2/17');
  await expect(page.locator('.incident-card').first().locator('.severity')).toHaveText('CANARY');
  await expect(page.locator('.incident-card').nth(1).locator('.card-movement')).toContainText('0.28%');
  await expect(page.locator('.incident-card').nth(2).locator('.card-movement')).toContainText('0.28%');
  const range = page.getByLabel('EXPLORE THE RECORD', { exact: false });
  await range.focus();
  await range.press('Home');
  await expect(range).toHaveValue('0');
  await expect(page.locator('.timeline-selected .eyebrow')).toContainText('07 Apr 2026');
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await expect(page.locator('.archive-row')).toHaveCount(40);
  const firstPublicId = fixture.incidents.at(-1)?.publicId;
  await page.getByRole('searchbox', { name: 'Search incidents' }).fill(firstPublicId!);
  await expect(page.locator('.archive-row')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search incidents' }).fill('');
  await page.getByRole('button', { name: 'NO MOVEMENT', exact: true }).click();
  await expect(page.locator('.archive-row')).toHaveCount(7);
  await page.getByRole('button', { name: 'CRITICAL', exact: true }).click();
  await expect(page.locator('.archive-row')).toHaveCount(5);
  await expect(page.locator('.archive-row').filter({hasText:'The Staging Agent Found Prod and Deleted the Lifeboats'})).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search incidents' }).fill('does-not-exist-in-the-record');
  await expect(page.getByRole('heading', { name: 'No matching developments.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.archive-row')).toHaveCount(40);
  await page.getByRole('searchbox', { name: 'Search incidents' }).fill('The Models Found');
  await expect(page.locator('.archive-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'The Models Found the Repo, the Key, and the Internet', exact: true }).click();
  await expect(page.locator('.report-header h1')).toContainText('The Models Found');
  await expect(page.getByRole('heading', { name: 'What happened.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why it matters.' })).toBeVisible();
  await expect(page.locator('.criterion-detail')).toHaveCount(8);
  await expect(page.locator('.trifecta-alert')).toContainText('ALL THREE CONDITIONS PRESENT');
  await expect(page.locator('.report-metrics')).toContainText('0.69%');
  await expect(page.locator('.report-metrics')).toContainText('10/17');
  await expect(page.locator('.report-metrics')).toContainText('7 + 3');
  await expect(page.locator('.impact-explainer')).toContainText('same share');
  await page.locator('.criterion-detail summary').first().click();
  await expect(page.locator('.criterion-detail').first()).toHaveAttribute('open', '');
  await page.reload();
  await expect(page.locator('.report-header h1')).toContainText('The Models Found');
  await page.goto('/#/incidents/2026-04-08-turbotax-claude');
  await expect(page.locator('.editorial-version-note')).toContainText('3-point assessment');
  await expect(page.locator('.editorial-version-note')).toContainText('selected 1-point assessment');
  await page.goto('/#/incidents/2026-09-25-openai-dns-sandbox');
  await expect(page.locator('.report-header h1')).toHaveText('The Sandbox Blocked the Web. DNS Had Other Ideas.');
  await expect(page.locator('.report-metrics')).toContainText('4/17');
  await expect(page.locator('.version-list > details')).toHaveCount(2);
  await page.locator('.alternate-editorial > summary').click();
  await expect(page.locator('.alternate-editorial h3')).toHaveText('The Model Found the DNS Side Door');
  await page.goto('/#/incidents/2026-09-24-openai-medicare-agent');
  await expect(page.locator('.report-metrics')).toContainText('9/17');
  await expect(page.locator('.version-list > details')).toHaveCount(3);
  await expect(page.locator('.variant-note')).toContainText('count the event once');
  await page.locator('.alternate-editorial > summary').click();
  await expect(page.locator('.alternate-editorial h3')).toHaveCount(2);
  await expect(page.locator('.alternate-editorial')).toContainText('The Research Agent Found the Staff-Only Door');
  await page.goto('/#/incidents/2026-09-12-amodei-slowdown-warning');
  await expect(page.getByRole('heading', { name: 'The recorded development.' })).toBeVisible();
  await expect(page.locator('.editorial-pending')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why it matters.' })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('methodology calculator, worked examples, downloads, and responsive layout', async ({ page }) => {
  await page.goto('/#/methodology');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.method-page')).toContainText('fixed at 1,000 evidence points');
  await expect(page.locator('.method-page')).toContainText('same scale applies to every historical and future event');
  await expect(page.locator('.method-formula')).toContainText('900 × 2');
  await expect(page.locator('.method-formula-copy')).toContainText('15:00 becomes 07:30, then 03:45');
  await expect(page.getByRole('link', { name: 'IMD AI Safety Clock', exact: true })).toHaveAttribute('href', 'https://www.imd.org/centers/digital-ai-transformation-center/aisafetyclock/');
  await expect(page.locator('.method-projected-time')).toHaveText('0%');
  await expect(page.locator('.method-calculator-output')).toContainText('13:52');
  const trifecta = page.locator('.method-toggle input');
  await expect(trifecta).toHaveCount(3);
  const expectedShares = ['0.07%', '0.21%', '0.48%'];
  const labels = await page.locator('.method-toggle').all();
  for (let index = 0; index < labels.length; index++) {
    await labels[index].click();
    await expect(page.locator('.method-projected-time')).toHaveText(expectedShares[index]);
  }
  for (const input of await trifecta.all()) await expect(input).toBeChecked();
  await expect(page.locator('.method-output-alert')).toBeVisible();
  await expect(page.locator('.method-projected-time')).toHaveText('0.48%');
  await expect(page.locator('.method-calculator-severity dd')).toHaveText('CRITICAL');
  await expect(page.locator('.method-calculator-output')).toContainText('7 / 17');
  const autonomy = page.locator('.method-stepper').nth(1);
  await autonomy.locator('label').nth(1).click();
  await expect(page.locator('.method-projected-time')).toHaveText('0.55%');
  await expect(page.locator('.method-calculator-output')).toContainText('8 / 17');
  await autonomy.locator('label').nth(2).click();
  await expect(page.locator('.method-projected-time')).toHaveText('0.62%');
  await expect(page.locator('.method-calculator-output')).toContainText('9 / 17');
  for (const stepper of await page.locator('.method-stepper').all()) await stepper.locator('label').nth(2).click();
  await expect(page.locator('.method-projected-time')).toHaveText('1.17%');
  await expect(page.locator('.method-calculator-output')).toContainText('17 / 17');
  await expect(page.locator('.method-calculator-output')).toContainText('13:42');
  await expect(page.locator('.method-calculator-severity dd')).toHaveText('EXISTENTIAL');
  await page.locator('.method-toggle').last().click();
  await expect(page.locator('.method-calculator-output')).toContainText('13 / 17');
  await expect(page.locator('.method-calculator-severity dd')).toHaveText('EXISTENTIAL');
  await page.getByRole('button', { name: /Reset/i }).click();
  await expect(page.locator('.method-projected-time')).toHaveText('0%');
  await page.locator('.method-stepper').first().locator('label').nth(2).click();
  await expect(page.locator('.method-projected-time')).toHaveText('0.14%');
  await page.getByRole('button', { name: /Reset/i }).click();
  await page.getByRole('button', { name: 'Example 02' }).click();
  await expect(page.locator('.method-trifecta-note')).toBeVisible();
  await expect(page.locator('.method-example-report')).toContainText('10/17');
  await expect(page.locator('.method-example-impact')).toContainText('0.69%');
  const downloads = page.locator('.method-downloads a[download]');
  await expect(downloads).toHaveCount(2);
  for (const link of await downloads.all()) {
    const href = await link.getAttribute('href');
    expect(href).toBe(`https://api.skynetcountdown.org/exports/${(await link.textContent())?.includes('Assessment') ? 'assessments' : 'stories'}.csv`);
    const csv = await page.evaluate(async (url) => (await fetch(url)).text(), href!);
    expect(csv).toContain('cve_id');
    expect(csv).toContain((await link.textContent())?.includes('Assessment') ? 'Sanders and Casar' : 'The Model Found the DNS Side Door');
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('live dataset failures can recover without inventing a fallback record', async ({ page }) => {
  let available = false;
  await page.unroute('https://api.skynetcountdown.org/**');
  await page.route(DATASET_URL, async (route) => {
    if (!available) await route.fulfill({ status: 503, body: 'Unavailable' });
    else await route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The record is temporarily out of reach.' })).toBeVisible();
  await expect(page.locator('.clock-digits')).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Retry connection' }).click();
  await expect(page.locator('.clock-digits')).toHaveText('13:52');
});

test('an empty live dataset is reported without rendering a clock', async ({ page }) => {
  await page.unroute('https://api.skynetcountdown.org/**');
  await page.route(DATASET_URL, async (route) => {
    await route.fulfill({ json: { ...fixture, incidents: [] }, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No incidents are on the record yet.' })).toBeVisible();
  await expect(page.locator('.clock-digits')).toHaveCount(0);
});

test('a failed refresh retains the last good dataset and reports staleness', async ({ page }) => {
  let requests = 0;
  await page.unroute('https://api.skynetcountdown.org/**');
  await page.route(DATASET_URL, async (route) => {
    requests += 1;
    if (requests === 1 || requests >= 3) await route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } });
    else await route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText('13:52');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('alert')).toContainText('Showing the last successfully loaded record');
  await expect(page.locator('.clock-digits')).toHaveText('13:52');
  await page.getByRole('button', { name: 'Retry now' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a successful visible refresh publishes new records without a page reload', async ({ page }) => {
  const updated = structuredClone(fixture);
  const previous = updated.incidents.at(-1)!;
  const added = structuredClone(previous);
  const nextTotal = fixture.totalPoints + 1;
  const nextClock = calculateClock(nextTotal);
  added.id = '2026-09-29-live-refresh-event';
  added.eventKey = added.id;
  added.publicId = 'SKYNET-2026-0041';
  added.headline = 'A New Signal Reached the Live Record';
  added.assessment.versionId = 'assessment-live-refresh';
  added.assessment.date = '2026-09-29';
  added.assessment.title = added.headline;
  added.assessment.sourceUrl = 'https://example.com/live-refresh-event';
  added.assessments = [added.assessment];
  if (added.editorial) {
    added.editorial.versionId = 'editorial-live-refresh';
    added.editorial.headline = added.headline;
    added.editorials = [added.editorial];
  }
  added.scoring = { trifectaCount: 1, trifectaPoints: 1, amplifierPoints: 0, totalPoints: 1, severity: 'CANARY' };
  added.effectivePoints = 1;
  added.gapClosedPercent = calculateGapClosedPercent(1);
  added.cumulativePoints = nextTotal;
  added.remainingSeconds = nextClock.remainingSeconds;
  added.movementSeconds = calculateMovementSeconds(fixture.totalPoints, 1);
  updated.incidents.push(added);
  updated.assessmentCount += 1;
  updated.editorialCount += 1;
  updated.matchedEditorialCount += 1;
  updated.totalPoints = nextTotal;
  updated.remainingSeconds = nextClock.remainingSeconds;
  updated.pressure = nextClock.pressure;
  updated.lastUpdated = '2026-09-29';
  updated.dataUpdatedAt = '2026-09-29T13:00:00.000Z';

  let requests = 0;
  await page.unroute('https://api.skynetcountdown.org/**');
  await page.route(DATASET_URL, async (route) => {
    requests += 1;
    await route.fulfill({ json: requests === 1 ? fixture : updated, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText('13:52');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.clock-digits')).toHaveText(formatTime(nextClock.remainingSeconds));
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search incidents' }).fill('SKYNET-2026-0041');
  await expect(page.locator('.archive-row')).toHaveCount(1);
  await expect(page.locator('.archive-row')).toContainText('A New Signal Reached the Live Record');
});

test('main pages render with local assets and unknown links recover', async ({ page }, testInfo) => {
  const failed: string[] = [];
  page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('127.0.0.1')) failed.push(response.url()); });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 24px "Barlow Condensed"'))).toBe(true);
  await expect(page.locator('body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.goto('/#/incidents');
  await page.screenshot({ path: testInfo.outputPath('archive.png'), fullPage: true });
  await page.goto('/#/methodology');
  await expect(page.locator('body')).not.toContainText(/METHOD 02|Version 2\.0|LEGACY WORKFLOW|EXCLUDED FROM V2|methodology v2/i);
  await page.screenshot({ path: testInfo.outputPath('methodology.png'), fullPage: true });
  await page.goto('/#/incidents/not-a-real-record');
  await expect(page.getByRole('heading', { name: 'This report isn’t on the record.' })).toBeVisible();
  await page.getByRole('link', { name: 'Return to the archive' }).click();
  await expect(page.locator('.archive-row')).toHaveCount(40);
  expect(failed).toEqual([]);
});

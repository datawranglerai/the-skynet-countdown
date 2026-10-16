import { expect, test } from '@playwright/test';
import { makeApiDatasetFixture } from './fixtures/api-dataset';

const DATASET_URL = 'https://api.skynetcountdown.org/dataset';
const REPORT_ID = '2026-09-24-openai-medicare-agent';

test('incident reports show one current assessment with a compact, stable record summary', async ({ page }, testInfo) => {
  const data = makeApiDatasetFixture();
  const incident = data.incidents.find((item) => item.id === REPORT_ID)!;
  incident.recordSummary = {
    firstRecordedAt: '2026-10-11T22:00:29.668Z',
    initialScore: 8,
    lastUpdatedAt: '2026-10-15T08:23:31.140Z',
  };
  const previousHeadlines = incident.editorials.filter((version) => version !== incident.editorial).map((version) => version.headline);
  expect(previousHeadlines.length).toBeGreaterThan(0);
  let requests = 0;
  await page.route(DATASET_URL, (route) => {
    requests += 1;
    return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(`/#/incidents/${REPORT_ID}`);
  await expect(page.locator('.report-header h1')).toHaveText(incident.headline);
  await expect(page.locator('.report-metrics')).toContainText('9/17');
  await expect(page.locator('.criterion-detail')).toHaveCount(8);
  await page.locator('.criterion-detail summary').first().click();
  await expect(page.locator('.criterion-detail').first()).toContainText(incident.assessment.rationales.t1);
  await expect(page.locator('.record-provenance details')).toHaveCount(0);
  for (const headline of previousHeadlines) await expect(page.getByText(headline, { exact: true })).toHaveCount(0);
  const note = page.getByRole('complementary', { name: 'Record history' });
  await expect(note).toContainText('First recorded 11 Oct 2026 at 8/17.');
  await expect(note).toContainText('Last updated 15 Oct 2026.');
  await expect(note.locator('time').first()).toHaveAttribute('datetime', incident.recordSummary.firstRecordedAt);
  await expect(note.locator('time').last()).toHaveAttribute('datetime', incident.recordSummary.lastUpdatedAt);
  await expect(page.getByRole('link', { name: 'Download the source data and history' })).toHaveAttribute('href', '#/methodology');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.record-provenance').scrollIntoViewIfNeeded();
  const assessmentBox = await page.locator('.assessment-panel').boundingBox();
  const recordBox = await page.locator('.record-provenance').boundingBox();
  expect(recordBox!.y).toBeGreaterThanOrEqual(assessmentBox!.y + assessmentBox!.height);
  await page.locator('.record-provenance').screenshot({ path: testInfo.outputPath('record-summary.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  // A cache refresh is not an edit to this incident.
  data.generatedAt = '2026-10-16T14:00:00.000Z';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(note).toContainText('Last updated 15 Oct 2026.');

  // A new selected assessment becomes visible without exposing its old versions.
  const revisedAssessment = { ...incident.assessment, versionId: 'latest-assessment', notes: 'The latest assessment explanation.' };
  incident.assessments.push(revisedAssessment);
  incident.assessment = revisedAssessment;
  incident.editorialMatchesAssessment = false;
  incident.editorialAssessmentScore = 9;
  incident.recordSummary.lastUpdatedAt = '2026-10-16T15:00:00.000Z';
  data.assessmentCount += 1;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.scoring-notes')).toContainText(revisedAssessment.notes);
  await expect(note).toContainText('Last updated 16 Oct 2026.');
  await expect(note).toContainText('First recorded 11 Oct 2026 at 8/17.');
  await expect(page.locator('.criterion-detail')).toHaveCount(8);
  await expect(page.locator('.record-provenance details')).toHaveCount(0);
});

test('older API responses omit the note instead of substituting the incident date', async ({ page }) => {
  const data = makeApiDatasetFixture();
  await page.route(DATASET_URL, (route) => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(`/#/incidents/${REPORT_ID}`);
  await expect(page.locator('.report-header h1')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Record history' })).toHaveCount(0);
  await expect(page.locator('.criterion-detail')).toHaveCount(8);
  await expect(page.locator('.record-provenance details')).toHaveCount(0);
});

test('the record note supports an initial zero score', async ({ page }) => {
  const data = makeApiDatasetFixture();
  const incident = data.incidents.find((item) => item.scoring.totalPoints === 0)!;
  incident.recordSummary = {
    firstRecordedAt: '2026-09-29T08:00:00.000Z', initialScore: 0,
    lastUpdatedAt: '2026-09-29T08:00:00.000Z',
  };
  await page.route(DATASET_URL, (route) => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(`/#/incidents/${incident.id}`);
  await expect(page.getByRole('complementary', { name: 'Record history' })).toContainText('First recorded 29 Sept 2026 at 0/17.');
  await expect(page.locator('.criterion-detail')).toHaveCount(8);
});

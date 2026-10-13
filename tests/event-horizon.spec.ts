import { expect, test } from '@playwright/test';
import { makeApiDatasetFixture } from './fixtures/api-dataset';
import { applyClockLedger } from '../src/lib/clock-ledger';
import { formatTime } from '../src/lib/calibration';
import { calculateRiskScore } from '../src/lib/scoring';
import type { Dataset, EventHorizonApproval } from '../src/lib/types';

function approvedFixture(atLatest = false): Dataset {
  const fixture = makeApiDatasetFixture();
  const anchor = atLatest ? fixture.incidents.at(-1)! : fixture.incidents[0];
  const approval: EventHorizonApproval = {
    approvedBy: 'Test editor',
    approvedAt: '2026-10-11T12:00:00.000Z',
    effectiveAfter: { date: anchor.assessment.date, incidentId: anchor.id },
    rationale: 'A synthetic decision used only to exercise the approved interface.',
    editorialUrl: 'https://example.com/event-horizon-decision',
  };
  const ledger = applyClockLedger(fixture.incidents.map(incident => ({
    id: incident.id, date: incident.assessment.date, score: incident.scoring.totalPoints,
  })), approval);
  const byId = new Map(ledger.entries.map(entry => [entry.id, entry]));
  return {
    ...fixture,
    clock: ledger.clock,
    totalPoints: ledger.totalPoints,
    remainingSeconds: ledger.remainingSeconds,
    pressure: ledger.pressure,
    incidents: fixture.incidents.map(incident => ({ ...incident, ...byId.get(incident.id)!, routeAliases: incident.routeAliases })),
  };
}

test('calculator previews the ten-point boundary without activating the live clock', async ({ page }, testInfo) => {
  const fixture = makeApiDatasetFixture();
  await page.route('https://api.skynetcountdown.org/dataset', route => route.fulfill({ json: fixture }));
  await page.goto('/#/methodology');
  await page.locator('#event-horizon').screenshot({ path: testInfo.outputPath('methodology-event-horizon.png') });
  await page.getByRole('radio', { name: 'After Event Horizon', exact: true }).check();
  for (const check of await page.locator('.method-toggle input').all()) await check.check();
  await page.locator('input[name="calculator-governance"][value="2"]').check();
  const output = page.locator('.method-calculator-output');
  await expect(output).toContainText('9 / 17');
  await expect(output).toContainText('CRITICAL');
  await expect(page.locator('.method-projected-time')).toHaveText('0%');
  await expect(output).toContainText('02:00');
  await expect(output).toContainText('scores below 10/17 do not move');
  await page.locator('input[name="calculator-erosion"][value="1"]').check();
  await expect(output).toContainText('10 / 17');
  await expect(page.locator('.method-projected-time')).toHaveText('2.73%');
  await expect(output).toContainText('01:57');
  await expect(output).toContainText('Local preview only');
  await page.getByRole('link', { name: 'The clock', exact: true }).click();
  await expect(page.locator('.clock-digits')).toHaveText('14:01');
  await expect(page.locator('.event-horizon-status')).toHaveCount(0);
  await page.locator('.clock-panel').screenshot({ path: testInfo.outputPath('approach-clock.png') });
});

test('approved state publishes its decision and keeps lower-scoring incidents visible', async ({ page }, testInfo) => {
  const fixture = approvedFixture();
  await page.route('https://api.skynetcountdown.org/dataset', route => route.fulfill({ json: fixture }));
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText(formatTime(fixture.remainingSeconds));
  await expect(page.locator('.event-horizon-state')).toHaveText('PHASE ACTIVE');
  await expect(page.getByRole('link', { name: 'READ THE DECISION' })).toHaveAttribute('href', fixture.clock.approval!.editorialUrl);
  await expect(page.locator('.timeline-transition-marker')).toBeVisible();
  await page.locator('.hero').screenshot({ path: testInfo.outputPath('active-clock.png') });
  await page.getByRole('link', { name: 'Incident archive', exact: true }).click();
  const below = fixture.incidents.find(incident => incident.clockPhase === 'event-horizon' && incident.scoring.totalPoints === 9)!;
  const belowRow = page.locator('.archive-row').filter({ has: page.getByRole('link', { name: below.headline, exact: true }) });
  await expect(belowRow).toContainText('9/17');
  await expect(belowRow).toContainText('BELOW 10/17');
  await page.getByRole('button', { name: 'NO MOVEMENT', exact: true }).click();
  await expect(belowRow).toBeVisible();
  await page.getByRole('button', { name: 'ALL SIGNALS', exact: true }).click();
  await page.getByLabel('SORT BY').selectOption('score');
  const shownScores = await page.locator('.archive-score > strong').allTextContents();
  const numericScores = shownScores.map(score => Number(score.split('/')[0]));
  expect(numericScores).toEqual([...numericScores].sort((a, b) => b - a));
  await page.getByRole('link', { name: below.headline, exact: true }).click();
  await expect(page.locator('.report-metrics')).toContainText('BELOW EVENT HORIZON THRESHOLD');
  await expect(page.locator('.impact-explainer')).toContainText('9-point incident remains on the record');
  await page.goto('/#/methodology/event-horizon');
  await expect(page.locator('#event-horizon')).toBeFocused();
  await expect(page.locator('.method-horizon-status')).toContainText('Entered by explicit human decision');
  await expect(page.locator('.method-horizon-decision')).toContainText('Test editor');
  await expect(page.locator('.method-baseline-note')).not.toContainText('has not been entered');
  await expect(page.getByRole('link', { name: 'Read the decision editorial' })).toHaveAttribute('href', fixture.clock.approval!.editorialUrl);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('an approval at the latest incident labels the separate jump to two minutes', async ({ page }, testInfo) => {
  const fixture = approvedFixture(true);
  expect(fixture.remainingSeconds).toBe(120);
  expect(fixture.incidents.at(-1)!.remainingSeconds).toBeGreaterThan(120);
  await page.route('https://api.skynetcountdown.org/dataset', route => route.fulfill({ json: fixture }));
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText('02:00');
  await expect(page.locator('.timeline-chart')).toHaveAttribute('aria-label', /reaches 02:00.*marked separately/);
  await expect(page.locator('.timeline-transition-marker text')).toHaveAttribute('text-anchor', 'end');
  await page.locator('.timeline-chart-wrap').screenshot({ path: testInfo.outputPath('latest-entry-timeline.png') });
});

test('near the boundary the clock stays above two minutes and its longer readout fits', async ({ page }, testInfo) => {
  const fixture = makeApiDatasetFixture();
  const template = fixture.incidents[0];
  const scoring = calculateRiskScore({ t1: 1, t2: 1, t3: 1, governance: 2, autonomy: 2, erosion: 2, sentience: 2, physical: 2 });
  const incidents = Array.from({ length: 650 }, (_, index) => {
    const id = `boundary-test-${String(index).padStart(4, '0')}`;
    const assessment = { ...template.assessment, versionId: id, title: 'Synthetic boundary fixture', date: '2026-10-01', fullTrifecta: true, score: 13, severity: 'EXISTENTIAL' as const, scores: { t1: 1, t2: 1, t3: 1, governance: 2, autonomy: 2, erosion: 2, sentience: 2, physical: 2 } };
    return { ...template, id, publicId: `TEST-${index}`, eventKey: String(index), assessment, assessments: [assessment], editorial: undefined, editorials: [], editorialMatchesAssessment: false, scoring };
  });
  const ledger = applyClockLedger(incidents.map(incident => ({ id: incident.id, date: incident.assessment.date, score: incident.scoring.totalPoints })), null);
  const data: Dataset = {
    ...fixture, clock: ledger.clock, totalPoints: ledger.totalPoints, remainingSeconds: ledger.remainingSeconds, pressure: ledger.pressure,
    assessmentCount: incidents.length, editorialCount: 0, duplicateCount: 0, matchedEditorialCount: 0, lastUpdated: '2026-10-01',
    incidents: incidents.map((incident, index) => ({ ...incident, ...ledger.entries[index], routeAliases: undefined })),
  };
  expect(data.remainingSeconds).toBeGreaterThan(120);
  await page.route('https://api.skynetcountdown.org/dataset', route => route.fulfill({ json: data }));
  await page.goto('/');
  await expect(page.locator('.clock-digits')).toHaveText('>02:00');
  await expect(page.locator('.event-horizon-status')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const readoutFits = await page.locator('.clock-digits').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getBoundingClientRect().width < element.closest('.clock-instrument')!.getBoundingClientRect().width * 0.66;
  });
  expect(readoutFits).toBe(true);
  const arcLength = await page.locator('.event-horizon-arc').evaluate(element => (element as SVGPathElement).getTotalLength());
  expect(arcLength).toBeLessThan(215); // Only the reserved 48-degree outer arc is marked.
  await page.locator('.clock-panel').screenshot({ path: testInfo.outputPath('near-boundary-clock.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  // At the left/right of the dial, the endpoint must not cover the time readout.
  for (const count of [29, 170]) {
    const sideIncidents = incidents.slice(0, count);
    const sideLedger = applyClockLedger(sideIncidents.map(incident => ({ id: incident.id, date: incident.assessment.date, score: incident.scoring.totalPoints })), null);
    Object.assign(data, {
      clock: sideLedger.clock, totalPoints: sideLedger.totalPoints, remainingSeconds: sideLedger.remainingSeconds, pressure: sideLedger.pressure,
      assessmentCount: count,
      incidents: sideIncidents.map((incident, index) => ({ ...incident, ...sideLedger.entries[index], routeAliases: undefined })),
    });
    await page.reload();
    await expect(page.locator('.clock-digits')).toHaveText(formatTime(data.remainingSeconds));
    await page.evaluate(() => document.fonts.ready);
    const overlaps = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.clock-digits')!);
      const digits = range.getBoundingClientRect();
      const marker = document.querySelector('.clock-position-backplate')!.getBoundingClientRect();
      return digits.left < marker.right && digits.right > marker.left && digits.top < marker.bottom && digits.bottom > marker.top;
    });
    expect(overlaps, `Position marker must clear ${formatTime(data.remainingSeconds)}`).toBe(false);
    await page.locator('.clock-panel').screenshot({ path: testInfo.outputPath(`side-position-${count}.png`) });
  }
});

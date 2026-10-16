import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Dataset } from './types.ts';
import { decodeDataset } from './api-response.ts';
import { calculateClock, calculateGapClosedPercent, calculateMovementSeconds } from './calibration.ts';

const assessment = {
  versionId: 'assessment-version-1', cveId: 'SKYNET-2026-0001', title: 'Test', date: '2026-01-01',
  sourceUrl: 'https://example.com/story', severity: 'CANARY' as const, score: 1, legacyMinutes: 1,
  fullTrifecta: false, leadingIndicator: false, leadingNote: '', notes: '',
  scores: { t1: 1 }, rationales: { t1: 'Evidence.' },
};
const editorial = {
  versionId: 'editorial-version-1', cveId: 'SKYNET-2026-0001', headline: 'Test report',
  severity: 'CANARY' as const, legacyDeltaLabel: '+1', legacyClockPosition: '59:35', metadata: '',
  story: 'What happened.', take: 'Why it matters.',
};
const fixture: Dataset = {
  source: 'fixture', generatedAt: '2026-09-29T12:00:00.000Z', dataUpdatedAt: '2026-09-29T11:00:00.000Z',
  incidents: [{
    id: 'test-event', publicId: 'SKYNET-2026-0041', eventKey: 'test-event',
    assessment, assessments: [assessment], editorial, editorials: [editorial], editorialMatchesAssessment: true,
    headline: editorial.headline, selectionRationale: 'Selected.',
    recordSummary: {
      firstRecordedAt: '2026-09-20T08:30:00.000Z', initialScore: 1,
      lastUpdatedAt: '2026-09-29T11:00:00.000Z',
    },
    scoring: { trifectaCount: 1, trifectaPoints: 1, amplifierPoints: 0, totalPoints: 1, severity: 'CANARY' },
    clockPhase: 'approach', phaseCumulativePoints: 1,
    effectivePoints: 1, gapClosedPercent: calculateGapClosedPercent(1), cumulativePoints: 1,
    remainingSeconds: calculateClock(1).remainingSeconds, movementSeconds: calculateMovementSeconds(0, 1),
  }],
  assessmentCount: 1, editorialCount: 1, duplicateCount: 0, matchedEditorialCount: 1, diagnostics: [],
  clock: { phase: 'approach', phasePoints: 1, approval: null, transition: null },
  totalPoints: 1, ...calculateClock(1), lastUpdated: '2026-01-01',
};

test('API decoder rebinds selected assessment and editorial versions after JSON serialization', () => {
  const decoded = decodeDataset(JSON.parse(JSON.stringify(fixture)));
  assert.equal(decoded.incidents[0].assessment, decoded.incidents[0].assessments[0]);
  assert.equal(decoded.incidents[0].editorial, decoded.incidents[0].editorials[0]);
  assert.deepEqual(decoded.incidents[0].recordSummary, fixture.incidents[0].recordSummary);
});

test('API decoder accepts records without a record summary', () => {
  const response = JSON.parse(JSON.stringify(fixture));
  delete response.incidents[0].recordSummary;
  assert.equal(decodeDataset(response).incidents[0].recordSummary, undefined);
});

test('API decoder rejects invalid record summaries', () => {
  const invalidSummaries = [
    null,
    { firstRecordedAt: 'not-a-date', initialScore: 1, lastUpdatedAt: '2026-09-29T11:00:00.000Z' },
    { firstRecordedAt: '2026-09-20T08:30:00.000Z', initialScore: -1, lastUpdatedAt: '2026-09-29T11:00:00.000Z' },
    { firstRecordedAt: '2026-09-20T08:30:00.000Z', initialScore: 1.5, lastUpdatedAt: '2026-09-29T11:00:00.000Z' },
    { firstRecordedAt: '2026-09-20T08:30:00.000Z', initialScore: 18, lastUpdatedAt: '2026-09-29T11:00:00.000Z' },
    { firstRecordedAt: '2026-09-30T00:00:00.000Z', initialScore: 1, lastUpdatedAt: '2026-09-29T11:00:00.000Z' },
  ];
  for (const recordSummary of invalidSummaries) {
    const response = JSON.parse(JSON.stringify(fixture));
    response.incidents[0].recordSummary = recordSummary;
    assert.throws(() => decodeDataset(response), /recordSummary/);
  }
});

test('API decoder rejects a selected version that is absent from history', () => {
  const response = JSON.parse(JSON.stringify(fixture));
  response.incidents[0].assessment.versionId = 'missing';
  assert.throws(() => decodeDataset(response), /does not match exactly one version/);
});

test('API decoder accepts legacy records without version IDs using stable content', () => {
  const response = JSON.parse(JSON.stringify(fixture));
  delete response.incidents[0].assessment.versionId;
  delete response.incidents[0].assessments[0].versionId;
  delete response.incidents[0].editorial.versionId;
  delete response.incidents[0].editorials[0].versionId;
  const decoded = decodeDataset(response);
  assert.equal(decoded.incidents[0].assessment, decoded.incidents[0].assessments[0]);
  assert.equal(decoded.incidents[0].editorial, decoded.incidents[0].editorials[0]);
});

test('API decoder recalculates legacy clock payloads as approach without inferring approval', () => {
  const response = JSON.parse(JSON.stringify(fixture));
  delete response.clock;
  delete response.incidents[0].clockPhase;
  delete response.incidents[0].phaseCumulativePoints;
  response.remainingSeconds = 1;
  response.pressure = 99;
  response.incidents[0].remainingSeconds = 1;
  response.incidents[0].movementSeconds = 899;
  const decoded = decodeDataset(response);
  assert.deepEqual(decoded.clock, { phase: 'approach', phasePoints: 1, approval: null, transition: null });
  assert.equal(decoded.remainingSeconds, calculateClock(1).remainingSeconds);
  assert.equal(decoded.incidents[0].remainingSeconds, calculateClock(1).remainingSeconds);
  assert.equal(decoded.incidents[0].clockPhase, 'approach');
});

test('API decoder rejects inconsistent or incomplete Event Horizon state', () => {
  const inconsistent = JSON.parse(JSON.stringify(fixture));
  inconsistent.clock.phasePoints = 2;
  assert.throws(() => decodeDataset(inconsistent), /inconsistent with the clock ledger/);

  const incomplete = JSON.parse(JSON.stringify(fixture));
  incomplete.clock.approval = {};
  assert.throws(() => decodeDataset(incomplete), /approval/);
});

test('API decoder rejects malformed top-level data', () => {
  assert.throws(() => decodeDataset({ incidents: 'nope' }), /dataset.incidents must be an array/);
});

test('API decoder accepts route aliases and rejects ambiguous routes', () => {
  const response = JSON.parse(JSON.stringify(fixture));
  response.incidents[0].routeAliases = ['retired-event-route'];
  assert.deepEqual(decodeDataset(response).incidents[0].routeAliases, ['retired-event-route']);

  response.incidents.push({
    ...response.incidents[0],
    id: 'second-event',
    eventKey: 'second-event',
    routeAliases: ['retired-event-route'],
  });
  assert.throws(() => decodeDataset(response), /route retired-event-route is claimed by both/);
});

test('API decoder rejects malformed route aliases', () => {
  for (const aliases of ['not-an-array', ['', 'valid'], ['duplicate', 'duplicate'], ['test-event']] as unknown[]) {
    const response = JSON.parse(JSON.stringify(fixture));
    response.incidents[0].routeAliases = aliases;
    assert.throws(() => decodeDataset(response), /routeAliases/);
  }
});

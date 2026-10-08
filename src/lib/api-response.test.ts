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
    scoring: { trifectaCount: 1, trifectaPoints: 1, amplifierPoints: 0, totalPoints: 1, severity: 'CANARY' },
    effectivePoints: 1, gapClosedPercent: calculateGapClosedPercent(1), cumulativePoints: 1,
    remainingSeconds: calculateClock(1).remainingSeconds, movementSeconds: calculateMovementSeconds(0, 1),
  }],
  assessmentCount: 1, editorialCount: 1, duplicateCount: 0, matchedEditorialCount: 1, diagnostics: [],
  totalPoints: 1, ...calculateClock(1), lastUpdated: '2026-01-01',
};

test('API decoder rebinds selected assessment and editorial versions after JSON serialization', () => {
  const decoded = decodeDataset(JSON.parse(JSON.stringify(fixture)));
  assert.equal(decoded.incidents[0].assessment, decoded.incidents[0].assessments[0]);
  assert.equal(decoded.incidents[0].editorial, decoded.incidents[0].editorials[0]);
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

test('API decoder rejects malformed top-level data', () => {
  assert.throws(() => decodeDataset({ incidents: 'nope' }), /dataset.incidents must be an array/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assessmentContentFingerprint,
  assessmentFingerprint,
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
  CALIBRATION,
  cleanMachineCitations,
  editorialContentFingerprint,
  editorialFingerprint,
  effectivePoints,
  formatTime,
  formatGapClosedPercent,
  formatPressure,
  HISTORICAL_MANIFEST,
  loadDataset,
  parseCsv,
  sourceDateAlias,
  type HistoricalEventManifest,
  type CsvRecord,
} from './index.ts';

const assessmentCsv = readFileSync(
  new URL('../../data/Skynet Countdown Log - assessments.csv', import.meta.url),
  'utf8',
);
const storyCsv = readFileSync(
  new URL('../../data/Skynet Countdown Log - stories.csv', import.meta.url),
  'utf8',
);

function encodeCsv(headers: readonly string[], rows: readonly CsvRecord[]): string {
  const encode = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${headers.map(encode).join(',')}\n${rows
    .map((row) => headers.map((header) => encode(row[header] ?? '')).join(','))
    .join('\n')}\n`;
}

function withRows(csv: string, transform: (rows: CsvRecord[]) => CsvRecord[]): string {
  const headers = csv.slice(0, csv.indexOf('\n')).replace(/\r$/, '').split(',');
  return encodeCsv(headers, transform(parseCsv(csv)));
}

function makeAssessment(overrides: Partial<CsvRecord> = {}): CsvRecord {
  return {
    ...parseCsv(assessmentCsv)[0],
    cve_id: 'SKYNET-2026-9001',
    incident_title: 'A unique appended test event.',
    incident_date: '2026-10-01',
    source_url: 'https://example.com/unique-test-event',
    classification: 'CANARY',
    total_score: '0',
    clock_delta_minutes: '0',
    full_trifecta: 'FALSE',
    t1_score: '0',
    t2_score: '0',
    t3_score: '0',
    amp_governance_vacuum_score: '0',
    amp_autonomy_score: '0',
    amp_capability_erosion_score: '0',
    amp_sentience_score: '0',
    amp_physical_score: '0',
    ...overrides,
  };
}

test('parses RFC 4180 quoting, escaped quotes and embedded newlines', () => {
  assert.deepEqual(parseCsv('\ufeffa,b\r\n"one, two","line 1\r\nline 2"\r\n"say ""hi""",done\r\n'), [
    { a: 'one, two', b: 'line 1\r\nline 2' },
    { a: 'say "hi"', b: 'done' },
  ]);
  assert.throws(() => parseCsv('a,b\n"never closes,x'), /unclosed quoted field/);
  assert.throws(() => parseCsv('a,b\n"closed"oops,x\n'), /unexpected character/);
  assert.throws(() => parseCsv('a,b\n1\n'), /has 1 fields; expected 2/);
});

test('removes machine citation markers without rewriting source prose', () => {
  assert.equal(
    cleanMachineCitations('Evidence here. citeturn1view0turn2search3 More evidence.'),
    'Evidence here. More evidence.',
  );
});

test('loads the audited source snapshot and reproduces exponential calibration v1', () => {
  const dataset = loadDataset(assessmentCsv, storyCsv);
  assert.equal(dataset.incidents.length, 35);
  assert.equal(HISTORICAL_MANIFEST.length, 35);
  assert.equal(HISTORICAL_MANIFEST.reduce((sum, event) => sum + event.assessmentContentFingerprints.length, 0), 39);
  assert.equal(HISTORICAL_MANIFEST.reduce((sum, event) => sum + event.storyLinks.length, 0), 30);
  assert.deepEqual(
    Object.fromEntries(HISTORICAL_MANIFEST.filter((event) => event.id >= '2026-09-21').map((event) => [
      event.id,
      {
        assessments: event.assessmentContentFingerprints,
        editorials: event.storyLinks.map((link) => link.storyContentFingerprint),
      },
    ])),
    {
      '2026-09-21-gemini-company-breach': { assessments: ['1683c6093c334865'], editorials: ['82d6755e18b5f702'] },
      '2026-09-22-frontier-ai-control-call': { assessments: ['275c1564e2ffda90'], editorials: [] },
      '2026-09-23-superintelligence-ban': { assessments: ['30746824f6bf0900'], editorials: [] },
      '2026-09-24-openai-medicare-agent': { assessments: ['c3d8e35ff0a013c3'], editorials: ['f55f15ccb1453648'] },
      '2026-09-24-safa-private-standards': { assessments: ['8fad2cb44d8b0048'], editorials: [] },
      '2026-09-25-openai-dns-sandbox': { assessments: ['7ddd4bcd705d9141'], editorials: ['be9dd520b2328d6c'] },
    },
  );
  assert.equal(dataset.assessmentCount, 39);
  assert.equal(dataset.editorialCount, 30);
  assert.equal(dataset.matchedEditorialCount, 30);
  assert.equal(dataset.duplicateCount, 4);
  assert.equal(dataset.incidents.reduce((sum, incident) => sum + incident.assessment.score, 0), 83);
  assert.equal(dataset.totalPoints, 88);
  assert.equal(dataset.remainingSeconds, 3600 * 2 ** (-88 / 100));
  assert.equal(dataset.pressure, calculateGapClosedPercent(88));
  assert.equal(dataset.lastUpdated, '2026-09-25');
  assert.deepEqual(dataset.diagnostics, []);
  assert.equal(dataset.incidents.filter((incident) => !incident.editorial).length, 7);
  const newIncidents = dataset.incidents.filter((incident) => incident.assessment.date > '2026-09-18');
  assert.equal(newIncidents.length, 6);
  assert.equal(newIncidents.filter((incident) => incident.editorial).length, 3);
  assert.equal(newIncidents.filter((incident) => !incident.editorial).length, 3);
  assert.deepEqual(newIncidents.map((incident) => incident.assessment.score).sort((a, b) => a - b), [0, 0, 1, 4, 5, 5]);
  assert.deepEqual(newIncidents.map((incident) => incident.effectivePoints).sort((a, b) => a - b), [0, 0, 1, 4, 7, 7]);
  assert.equal(dataset.incidents.filter((incident) => incident.assessment.fullTrifecta).length, 3);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.assessments.length, 2);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.editorials.length, 2);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.editorialMatchesAssessment, true);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-08-turbotax-claude')?.editorialMatchesAssessment, false);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-08-turbotax-claude')?.editorialAssessmentScore, 2);
  assert.ok(dataset.incidents.every((incident) => !incident.assessment.title.includes('cite')));
});

test('audited selection and chronology do not depend on CSV row order', () => {
  const baseline = loadDataset(assessmentCsv, storyCsv);
  const reversedAssessments = withRows(assessmentCsv, (rows) => rows.reverse());
  const reversedStories = withRows(storyCsv, (rows) => rows.reverse());
  const reordered = loadDataset(reversedAssessments, reversedStories);
  assert.deepEqual(
    reordered.incidents.map(({ id, headline, cumulativePoints, remainingSeconds }) => ({ id, headline, cumulativePoints, remainingSeconds })),
    baseline.incidents.map(({ id, headline, cumulativePoints, remainingSeconds }) => ({ id, headline, cumulativePoints, remainingSeconds })),
  );
});

test('accepts appended unique events and gives zero-score events exactly zero movement', () => {
  const rows = parseCsv(assessmentCsv);
  const headers = Object.keys(rows[0]);
  const appended = encodeCsv(headers, [
    ...rows,
    makeAssessment({
      cve_id: 'SKYNET-2026-9001',
      total_score: '2',
      t2_score: '1',
      amp_governance_vacuum_score: '1',
      classification: 'CANARY',
    }),
    makeAssessment({
      cve_id: 'SKYNET-2026-9002',
      incident_title: 'A later zero-score event.',
      incident_date: '2026-10-02',
      source_url: 'https://example.com/later-zero-event',
    }),
  ]);
  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  const appendedStory = {
    ...storyRows[0],
    cve_id: 'SKYNET-2026-9001',
    headline: 'A unique appended editorial',
    severity_label: 'CANARY',
    clock_delta_label: '+0 MINUTES',
    updated_clock_position: '12:00',
  };
  const dataset = loadDataset(appended, encodeCsv(storyHeaders, [...storyRows, appendedStory]));
  assert.equal(dataset.incidents.length, 37);
  assert.equal(dataset.totalPoints, 90);
  assert.equal(dataset.matchedEditorialCount, 31);
  assert.deepEqual(dataset.diagnostics, []);
  assert.equal(dataset.incidents.find((incident) => incident.assessment.cveId === 'SKYNET-2026-9001')?.editorial?.headline, 'A unique appended editorial');
  assert.equal(dataset.incidents.at(-1)?.movementSeconds, 0);
  assert.equal(dataset.incidents.at(-1)?.remainingSeconds, dataset.incidents.at(-2)?.remainingSeconds);
});

test('fails closed for unreviewed revisions and ambiguous legacy identifiers', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = Object.keys(assessmentRows[0]);
  const revision = {
    ...assessmentRows[4],
    cve_id: 'SKYNET-2026-9003',
    total_score: '5',
    amp_autonomy_score: '2',
    classification: 'SIGNIFICANT',
  };
  const revisedCsv = encodeCsv(assessmentHeaders, [...assessmentRows, revision]);
  const revised = loadDataset(revisedCsv, storyCsv);
  assert.ok(revised.diagnostics.some((message) => message.includes('Unreviewed assessment revision')));

  const sameIdentityRevision = { ...assessmentRows[0], scoring_notes: 'A changed assessment rationale.' };
  const sameIdentity = loadDataset(
    encodeCsv(assessmentHeaders, [...assessmentRows, sameIdentityRevision]),
    storyCsv,
  );
  assert.ok(sameIdentity.diagnostics.some((message) => message.includes('Unreviewed assessment content')));

  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  const ambiguousStory = {
    ...storyRows[0],
    cve_id: 'SKYNET-2026-0015',
    headline: 'An unaudited story with a reused identifier',
  };
  const ambiguous = loadDataset(assessmentCsv, encodeCsv(storyHeaders, [...storyRows, ambiguousStory]));
  assert.ok(ambiguous.diagnostics.some((message) => message.includes('Ambiguous or unmatched story')));
  assert.equal(ambiguous.matchedEditorialCount, 30);
});

test('full-content audits reject in-place assessment and editorial rewrites', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = Object.keys(assessmentRows[0]);
  assessmentRows[0] = { ...assessmentRows[0], t1_rationale: 'A rewritten rationale with the same score.' };
  const changedAssessment = loadDataset(encodeCsv(assessmentHeaders, assessmentRows), storyCsv);
  assert.ok(changedAssessment.diagnostics.some((message) => message.includes('Unreviewed assessment content')));
  assert.ok(changedAssessment.diagnostics.some((message) => message.includes('requires assessment content')));

  const reallocatedRows = parseCsv(assessmentCsv);
  reallocatedRows[4] = {
    ...reallocatedRows[4],
    amp_governance_vacuum_score: '0',
    amp_capability_erosion_score: '1',
  };
  const reallocated = loadDataset(encodeCsv(assessmentHeaders, reallocatedRows), storyCsv);
  assert.ok(reallocated.diagnostics.some((message) => message.includes('Unreviewed assessment content')));

  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  storyRows[0] = { ...storyRows[0], our_take: 'A rewritten editorial take.' };
  const changedEditorial = loadDataset(assessmentCsv, encodeCsv(storyHeaders, storyRows));
  assert.ok(changedEditorial.diagnostics.some((message) => message.includes('unreviewed content')));
  assert.ok(changedEditorial.diagnostics.some((message) => message.includes('requires editorial content')));
  assert.equal(changedEditorial.matchedEditorialCount, 29);
});

test('a custom manifest can approve and select a same-identity assessment revision', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = Object.keys(assessmentRows[0]);
  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  const originalRow = assessmentRows[5];
  const originalStoryRow = storyRows[5];
  const revisionRow = {
    ...originalRow,
    t2_score: '0',
    t2_rationale: 'The reviewed revision no longer counts this as untrusted input.',
    amp_governance_vacuum_score: '1',
    amp_governance_vacuum_rationale: 'The reviewed revision instead records incomplete governance.',
  };
  const originalOnly = loadDataset(
    encodeCsv(assessmentHeaders, [originalRow]),
    encodeCsv(storyHeaders, [originalStoryRow]),
    { manifest: [] },
  );
  const revisionOnly = loadDataset(
    encodeCsv(assessmentHeaders, [revisionRow]),
    encodeCsv(storyHeaders, [originalStoryRow]),
    { manifest: [] },
  );
  const originalAssessment = originalOnly.incidents[0].assessment;
  const revisedAssessment = revisionOnly.incidents[0].assessment;
  const editorial = originalOnly.incidents[0].editorial!;
  const assessmentIdentity = assessmentFingerprint(
    originalAssessment.cveId,
    originalAssessment.date,
    originalAssessment.sourceUrl,
    originalAssessment.score,
    originalAssessment.fullTrifecta,
  );
  const originalContent = assessmentContentFingerprint(originalAssessment);
  const revisedContent = assessmentContentFingerprint(revisedAssessment);
  const revisionManifest: HistoricalEventManifest = {
    id: 'reviewed-turbotax-revision',
    aliases: [sourceDateAlias(originalAssessment.date, originalAssessment.sourceUrl)],
    selectedAssessmentFingerprint: assessmentIdentity,
    selectedAssessmentContentFingerprint: revisedContent,
    assessmentContentFingerprints: [originalContent, revisedContent],
    selectionRationale: 'The editor approved the criterion reallocation and selected the revised assessment.',
    storyLinks: [{
      storyFingerprint: editorialFingerprint(editorial.cveId, editorial.headline),
      storyContentFingerprint: editorialContentFingerprint(editorial),
      assessmentFingerprint: assessmentIdentity,
      assessmentContentFingerprint: originalContent,
    }],
  };
  const approved = loadDataset(
    encodeCsv(assessmentHeaders, [originalRow, revisionRow]),
    encodeCsv(storyHeaders, [originalStoryRow]),
    { manifest: [revisionManifest] },
  );
  assert.deepEqual(approved.diagnostics, []);
  assert.equal(approved.incidents.length, 1);
  assert.equal(approved.incidents[0].assessments.length, 2);
  assert.equal(approved.incidents[0].assessment.scores.t2, 0);
  assert.equal(approved.incidents[0].assessment.scores.governance, 1);
  assert.equal(approved.incidents[0].effectivePoints, 2);
  assert.equal(approved.incidents[0].editorialMatchesAssessment, false);
  assert.equal(approved.incidents[0].editorialAssessmentScore, 2);
});

test('a custom manifest can approve and prefer an editorial revision with the same headline', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = Object.keys(assessmentRows[0]);
  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  const assessmentRow = assessmentRows[0];
  const originalStoryRow = storyRows[0];
  const revisedStoryRow = {
    ...originalStoryRow,
    our_take: `${originalStoryRow.our_take}\n\nEditorial revision approved.`,
  };
  const originalOnly = loadDataset(
    encodeCsv(assessmentHeaders, [assessmentRow]),
    encodeCsv(storyHeaders, [originalStoryRow]),
    { manifest: [] },
  );
  const revisedOnly = loadDataset(
    encodeCsv(assessmentHeaders, [assessmentRow]),
    encodeCsv(storyHeaders, [revisedStoryRow]),
    { manifest: [] },
  );
  const assessment = originalOnly.incidents[0].assessment;
  const originalEditorial = originalOnly.incidents[0].editorial!;
  const revisedEditorial = revisedOnly.incidents[0].editorial!;
  const assessmentIdentity = assessmentFingerprint(
    assessment.cveId, assessment.date, assessment.sourceUrl, assessment.score, assessment.fullTrifecta,
  );
  const assessmentContent = assessmentContentFingerprint(assessment);
  const storyIdentity = editorialFingerprint(originalEditorial.cveId, originalEditorial.headline);
  const editorialManifest: HistoricalEventManifest = {
    id: 'reviewed-editorial-revision',
    aliases: [sourceDateAlias(assessment.date, assessment.sourceUrl)],
    selectedAssessmentFingerprint: assessmentIdentity,
    selectedAssessmentContentFingerprint: assessmentContent,
    assessmentContentFingerprints: [assessmentContent],
    selectionRationale: 'The supplied assessment is authoritative.',
    storyLinks: [
      {
        storyFingerprint: storyIdentity,
        storyContentFingerprint: editorialContentFingerprint(originalEditorial),
        assessmentFingerprint: assessmentIdentity,
        assessmentContentFingerprint: assessmentContent,
      },
      {
        storyFingerprint: storyIdentity,
        storyContentFingerprint: editorialContentFingerprint(revisedEditorial),
        assessmentFingerprint: assessmentIdentity,
        assessmentContentFingerprint: assessmentContent,
        preferred: true,
      },
    ],
  };
  const approved = loadDataset(
    encodeCsv(assessmentHeaders, [assessmentRow]),
    encodeCsv(storyHeaders, [originalStoryRow, revisedStoryRow]),
    { manifest: [editorialManifest] },
  );
  assert.deepEqual(approved.diagnostics, []);
  assert.equal(approved.incidents[0].editorials.length, 2);
  assert.equal(approved.incidents[0].editorial?.take, revisedEditorial.take);
  assert.equal(approved.incidents[0].editorialMatchesAssessment, true);
});

test('manifest coverage is bidirectional while an explicit empty manifest supports isolated fixtures', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = Object.keys(assessmentRows[0]);
  const missingAssessment = loadDataset(encodeCsv(assessmentHeaders, assessmentRows.slice(1)), storyCsv);
  assert.ok(missingAssessment.diagnostics.some((message) => message.includes('requires assessment content')));

  const missingSelectedRows = assessmentRows.filter((_, index) => index !== 4);
  const missingSelected = loadDataset(encodeCsv(assessmentHeaders, missingSelectedRows), storyCsv);
  assert.ok(missingSelected.diagnostics.some((message) => message.includes('exactly one selected assessment; found 0')));

  const storyRows = parseCsv(storyCsv);
  const storyHeaders = Object.keys(storyRows[0]);
  const missingEditorial = loadDataset(assessmentCsv, encodeCsv(storyHeaders, storyRows.slice(1)));
  assert.ok(missingEditorial.diagnostics.some((message) => message.includes('requires editorial content')));

  const isolated = loadDataset(
    encodeCsv(assessmentHeaders, [assessmentRows[0]]),
    encodeCsv(storyHeaders, [storyRows[0]]),
    { manifest: [] },
  );
  assert.deepEqual(isolated.diagnostics, []);
  assert.equal(isolated.incidents.length, 1);
  assert.equal(isolated.matchedEditorialCount, 1);
});

test('explicit event ids support deliberate cross-source grouping but conflicting revisions are diagnosed', () => {
  const rows = parseCsv(assessmentCsv);
  const headers = [...Object.keys(rows[0]), 'event_id'];
  const first = makeAssessment({
    cve_id: 'SKYNET-2026-9004',
    incident_date: '2026-10-03',
    source_url: 'https://example.com/source-one',
    event_id: 'shared-event',
  });
  const second = makeAssessment({
    cve_id: 'SKYNET-2026-9005',
    incident_date: '2026-10-04',
    source_url: 'https://example.net/source-two',
    event_id: 'shared-event',
    total_score: '1',
    t1_score: '1',
  });
  const dataset = loadDataset(encodeCsv(headers, [...rows, first, second]), storyCsv);
  assert.equal(dataset.incidents.filter((incident) => incident.id === 'shared-event').length, 1);
  assert.ok(dataset.diagnostics.some((message) => message.includes('Conflicting assessments')));
});

test('future story event_id columns provide an explicit join independent of legacy ids', () => {
  const assessmentRows = parseCsv(assessmentCsv);
  const assessmentHeaders = [...Object.keys(assessmentRows[0]), 'event_id'];
  const futureAssessment = makeAssessment({
    cve_id: 'SKYNET-2026-9006',
    incident_date: '2026-10-05',
    source_url: 'https://example.com/explicit-event',
    event_id: 'future-explicit-event',
  });
  const storyRows = parseCsv(storyCsv);
  const storyHeaders = [...Object.keys(storyRows[0]), 'event_id', 'incident_date', 'source_url'];
  const futureStory = {
    ...storyRows[0],
    cve_id: 'SKYNET-2026-0015',
    headline: 'An explicitly linked future editorial',
    event_id: 'future-explicit-event',
    incident_date: '2026-10-05',
    source_url: 'https://example.com/explicit-event',
  };
  const dataset = loadDataset(
    encodeCsv(assessmentHeaders, [...assessmentRows, futureAssessment]),
    encodeCsv(storyHeaders, [...storyRows, futureStory]),
  );
  assert.deepEqual(dataset.diagnostics, []);
  assert.equal(dataset.incidents.find((incident) => incident.id === 'future-explicit-event')?.editorial?.headline, 'An explicitly linked future editorial');
});

test('historical aliases and ids outrank conflicting supplied event ids and corrections count once', () => {
  const rows = parseCsv(assessmentCsv);
  const headers = [...Object.keys(rows[0]), 'event_id'];
  const withConflict = rows.map((row, index) => ({
    ...row,
    event_id: index === 0 ? 'wrong-historical-id' : '',
  }));
  const conflict = loadDataset(encodeCsv(headers, withConflict), storyCsv);
  assert.equal(conflict.incidents.length, 35);
  assert.ok(conflict.diagnostics.some((message) => message.includes('conflicting event_id')));

  const withPinnedIdentity = rows.map((row, index) => ({
    ...row,
    event_id: index === 0 ? '2026-04-09-openai-advertising' : '',
  }));
  const pinnedIdentity = loadDataset(encodeCsv(headers, withPinnedIdentity), storyCsv);
  assert.ok(pinnedIdentity.diagnostics.some((message) => message.includes('Unreviewed assessment content')));

  const correction = makeAssessment({
    cve_id: 'SKYNET-2026-9007',
    incident_date: '2026-10-06',
    source_url: 'https://example.com/corrected-source',
    event_id: '2026-04-09-openai-advertising',
    total_score: '1',
    t1_score: '1',
  });
  const corrected = loadDataset(encodeCsv(headers, [...rows, correction]), storyCsv);
  assert.equal(corrected.incidents.length, 35);
  assert.equal(corrected.incidents.filter((incident) => incident.id === '2026-04-09-openai-advertising').length, 1);
  assert.ok(corrected.diagnostics.some((message) => message.includes('Unreviewed assessment')));
});

test('normalises source aliases and rejects reused ids across unrelated new events', () => {
  assert.equal(
    sourceDateAlias('2026-10-07', 'http://WWW.Example.com:80/path/?utm_source=test&b=2&a=1#section'),
    '2026-10-07|https://example.com/path?a=1&b=2',
  );
  const rows = parseCsv(assessmentCsv);
  const headers = Object.keys(rows[0]);
  const first = makeAssessment({
    cve_id: 'SKYNET-2026-9008',
    incident_date: '2026-10-07',
    source_url: 'https://example.com/first',
  });
  const second = makeAssessment({
    cve_id: 'SKYNET-2026-9008',
    incident_date: '2026-10-08',
    source_url: 'https://example.com/second',
  });
  const dataset = loadDataset(encodeCsv(headers, [...rows, first, second]), storyCsv);
  assert.ok(dataset.diagnostics.some((message) => message.includes('appears across unrelated new events')));

  const explicitHeaders = [...headers, 'event_id'];
  const explicitlySeparated = loadDataset(encodeCsv(explicitHeaders, [
    ...rows,
    { ...first, event_id: 'explicit-reused-id-one' },
    { ...second, event_id: 'explicit-reused-id-two' },
  ]), storyCsv);
  assert.ok(!explicitlySeparated.diagnostics.some((message) => message.includes('appears across unrelated new events')));
  assert.equal(explicitlySeparated.incidents.filter((incident) => incident.assessment.cveId === 'SKYNET-2026-9008').length, 2);
});

test('strict row validation rejects impossible dates and score totals', () => {
  const rows = parseCsv(assessmentCsv);
  const headers = Object.keys(rows[0]);
  assert.throws(
    () => loadDataset(encodeCsv(headers, [...rows, makeAssessment({ incident_date: '2026-02-31' })]), storyCsv),
    /invalid ISO date/,
  );
  assert.throws(
    () => loadDataset(encodeCsv(headers, [...rows, makeAssessment({ total_score: '2' })]), storyCsv),
    /does not equal criterion total/,
  );
});

test('validates scoring bands and applies the complete-Trifecta floor', () => {
  assert.equal(effectivePoints(6, true), 7);
  assert.equal(effectivePoints(5, true), 7);
  assert.equal(effectivePoints(9, true), 9);
  assert.equal(effectivePoints(0, false), 0);
  assert.throws(() => effectivePoints(-1, false), /non-negative finite/);
  assert.throws(() => effectivePoints(Number.MAX_SAFE_INTEGER + 1, false), /safe integer/);
  assert.throws(() => calculateClock(Number.NaN), /non-negative finite/);
});

test('exponential calibration halves every 100 points and never reaches zero', () => {
  assert.deepEqual(CALIBRATION, {
    version: '1.0',
    effectiveDate: '2026-09-27',
    halfwayPoints: 100,
    startingSeconds: 3600,
  });
  assert.deepEqual(calculateClock(100), { remainingSeconds: 1800, pressure: 50 });
  assert.equal(calculateClock(0).remainingSeconds, 3600);
  assert.equal(calculateClock(200).remainingSeconds, 900);
  assert.ok(calculateClock(1_000_000).remainingSeconds > 0);
  const extreme = calculateClock(Number.MAX_VALUE);
  assert.ok(Number.isFinite(extreme.remainingSeconds));
  assert.ok(extreme.remainingSeconds > 0);
  assert.equal(extreme.pressure, 100);
  assert.equal(formatTime(extreme.remainingSeconds), '<00:01');
  assert.equal(calculateGapClosedPercent(0), 0);
  assert.equal(formatGapClosedPercent(0), '0%');
  assert.equal(formatGapClosedPercent(calculateGapClosedPercent(2)), '1.38%');
  assert.equal(formatPressure(45.663256873697094), '45.7');
  assert.equal(formatPressure(99.95), '<100');
  assert.equal(formatPressure(100), '<100');
  assert.equal(formatTime(3600), '60:00');
  assert.equal(formatTime(2130.1775), '35:30');
  assert.equal(formatTime(0.99), '<00:01');
  assert.throws(() => formatTime(-0.1), /non-negative finite/);
});

test('event impact is a constant proportional gap closure independent of prior evidence', () => {
  for (const points of [2, 13]) {
    const expectedFraction = calculateGapClosedPercent(points) / 100;
    for (const priorPoints of [0, 50, 500]) {
      const before = calculateClock(priorPoints).remainingSeconds;
      const after = calculateClock(priorPoints + points).remainingSeconds;
      assert.ok(Math.abs((before - after) / before - expectedFraction) < 1e-14);
      assert.ok(Math.abs(calculateMovementSeconds(priorPoints, points) / before - expectedFraction) < 1e-14);
    }
  }
  assert.equal(formatGapClosedPercent(calculateGapClosedPercent(2)), '1.38%');
  assert.equal(formatGapClosedPercent(calculateGapClosedPercent(13)), '8.62%');
});

test('movement remains positive at the representational floor for every positive event', () => {
  assert.equal(calculateMovementSeconds(Number.MAX_VALUE, 0), 0);
  for (const points of [1, 2, 7, 13]) {
    const movement = calculateMovementSeconds(Number.MAX_VALUE, points);
    assert.ok(Number.isFinite(movement));
    assert.ok(movement > 0);
    assert.equal(movement, Number.MIN_VALUE);
  }
  assert.equal(formatGapClosedPercent(calculateGapClosedPercent(13)), '8.62%');
  assert.throws(() => calculateMovementSeconds(-1, 1), /non-negative finite/);
  assert.throws(() => calculateMovementSeconds(1, Number.NaN), /non-negative finite/);
});

test('chronological deltas reconcile to the full clock movement and event gap percentages', () => {
  const dataset = loadDataset(assessmentCsv, storyCsv);
  const totalMovement = dataset.incidents.reduce((sum, incident) => sum + incident.movementSeconds, 0);
  assert.ok(Math.abs(totalMovement - (CALIBRATION.startingSeconds - dataset.remainingSeconds)) < 1e-9);
  let priorRemaining: number = CALIBRATION.startingSeconds;
  for (const incident of dataset.incidents) {
    assert.equal(incident.gapClosedPercent, calculateGapClosedPercent(incident.effectivePoints));
    if (incident.effectivePoints === 0) {
      assert.equal(incident.movementSeconds, 0);
    } else {
      assert.ok(Math.abs(incident.movementSeconds / priorRemaining - incident.gapClosedPercent / 100) < 1e-14);
    }
    priorRemaining = incident.remainingSeconds;
  }
});

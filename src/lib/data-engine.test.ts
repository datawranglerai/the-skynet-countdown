import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assessmentContentFingerprint,
  assessmentFingerprint,
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
  calculateRiskScore,
  CALIBRATION,
  cleanMachineCitations,
  CRITERIA,
  editorialContentFingerprint,
  editorialFingerprint,
  formatTime,
  formatGapClosedPercent,
  formatPressure,
  HISTORICAL_MANIFEST,
  loadDataset,
  MAX_SCORE,
  parseCsv,
  sourceDateAlias,
  SEVERITY_DESCRIPTORS,
  TRIFECTA_WEIGHTS,
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

test('identical assessment copies count once while changed content still needs review', () => {
  const row = parseCsv(assessmentCsv)[0];
  const story = parseCsv(storyCsv)[0];
  const manifest = HISTORICAL_MANIFEST.filter((entry) => entry.aliases.includes(sourceDateAlias(row.incident_date, row.source_url)));
  const input = (rows: CsvRecord[]) => loadDataset(
    encodeCsv(Object.keys(row), rows),
    encodeCsv(Object.keys(story), [story]),
    { manifest },
  );
  const single = input([row]);
  const repeated = input([row, { ...row }, { ...row }]);
  assert.deepEqual(repeated.diagnostics, []);
  assert.equal(repeated.assessmentCount, 3);
  assert.equal(repeated.incidents.length, 1);
  assert.equal(repeated.incidents[0].assessments.length, 1);
  assert.equal(repeated.totalPoints, single.totalPoints);
  assert.equal(repeated.incidents[0].editorialMatchesAssessment, true);

  const changed = input([row, row, { ...row, scoring_notes: 'This is a different assessment, not another copy.' }]);
  assert.ok(changed.diagnostics.some((message) => message.includes('Unreviewed assessment content')));
});

test('audited alternate assessments need no editorial and retain every source alias', () => {
  const original = parseCsv(assessmentCsv)[0];
  const story = parseCsv(storyCsv)[0];
  const alternate = {
    ...original,
    cve_id: 'SKYNET-2026-9009',
    incident_date: '2026-10-02',
    source_url: 'https://example.com/another-report-of-the-same-event',
  };
  const alternateOnly = loadDataset(
    encodeCsv(Object.keys(original), [alternate]),
    encodeCsv(Object.keys(story), [story]),
    { manifest: [] },
  );
  const originalManifest = HISTORICAL_MANIFEST.find((entry) => entry.aliases.includes(sourceDateAlias(original.incident_date, original.source_url)))!;
  const manifest: HistoricalEventManifest = {
    ...originalManifest,
    aliases: [...originalManifest.aliases, sourceDateAlias(alternate.incident_date, alternate.source_url)],
    assessmentContentFingerprints: [...originalManifest.assessmentContentFingerprints, assessmentContentFingerprint(alternateOnly.incidents[0].assessment)],
  };
  const assessmentInput = encodeCsv(Object.keys(original), [original, alternate]);
  const withoutEditorial = loadDataset(assessmentInput, encodeCsv(Object.keys(story), [story]), { manifest: [manifest] });
  assert.deepEqual(withoutEditorial.diagnostics, []);
  assert.equal(withoutEditorial.incidents.length, 1);
  assert.equal(withoutEditorial.incidents[0].assessments.length, 2);

  const alternateStory = {
    ...story,
    cve_id: alternate.cve_id,
    headline: 'Another report with an explicit source and date',
    incident_date: alternate.incident_date,
    source_url: alternate.source_url,
  };
  const joined = loadDataset(
    assessmentInput,
    encodeCsv([...Object.keys(story), 'incident_date', 'source_url'], [story, alternateStory]),
    { manifest: [manifest] },
  );
  assert.deepEqual(joined.diagnostics, []);
  assert.equal(joined.matchedEditorialCount, 2);
  assert.equal(joined.incidents[0].editorials.length, 2);
  assert.equal(joined.incidents[0].assessment.sourceUrl, original.source_url);
});

test('assessment content approval belongs to exactly one reviewed event', () => {
  const original = parseCsv(assessmentCsv)[0];
  const story = parseCsv(storyCsv)[0];
  const unrelated = makeAssessment({ cve_id: 'SKYNET-2026-9010' });
  const unrelatedOnly = loadDataset(
    encodeCsv(Object.keys(original), [unrelated]),
    encodeCsv(Object.keys(story), [story]),
    { manifest: [] },
  );
  const originalManifest = HISTORICAL_MANIFEST.find((entry) => entry.aliases.includes(sourceDateAlias(original.incident_date, original.source_url)))!;
  const misplaced = {
    ...originalManifest,
    assessmentContentFingerprints: [...originalManifest.assessmentContentFingerprints, assessmentContentFingerprint(unrelatedOnly.incidents[0].assessment)],
  };
  const wrongEvent = loadDataset(
    encodeCsv(Object.keys(original), [original, unrelated]),
    encodeCsv(Object.keys(story), [story]),
    { manifest: [misplaced] },
  );
  assert.ok(wrongEvent.diagnostics.some((message) => message.includes('does not contain its audited assessment content')));

  const otherEvent = HISTORICAL_MANIFEST.find((entry) => entry.id !== originalManifest.id)!;
  const shared = HISTORICAL_MANIFEST.map((entry) => entry.id === otherEvent.id ? {
    ...entry,
    assessmentContentFingerprints: [...entry.assessmentContentFingerprints, originalManifest.selectedAssessmentContentFingerprint],
  } : entry);
  const doubleApproval = loadDataset(assessmentCsv, storyCsv, { manifest: shared });
  assert.ok(doubleApproval.diagnostics.some((message) => message.includes('assigned to multiple historical events')));
});

test('loads the audited source snapshot and reproduces exponential calibration v1', () => {
  const dataset = loadDataset(assessmentCsv, storyCsv);
  assert.equal(dataset.incidents.length, 40);
  assert.equal(HISTORICAL_MANIFEST.length, 40);
  assert.equal(HISTORICAL_MANIFEST.reduce((sum, event) => sum + event.assessmentContentFingerprints.length, 0), 51);
  assert.equal(HISTORICAL_MANIFEST.reduce((sum, event) => sum + event.storyLinks.length, 0), 38);
  assert.equal(dataset.assessmentCount, 63);
  assert.equal(dataset.incidents.reduce((sum, incident) => sum + incident.assessments.length, 0), 51);
  assert.equal(dataset.editorialCount, 38);
  assert.equal(dataset.matchedEditorialCount, 38);
  assert.equal(dataset.duplicateCount, 23);
  assert.equal(dataset.incidents.reduce((sum, incident) => sum + incident.assessment.score, 0), 96);
  assert.equal(dataset.totalPoints, 113);
  assert.equal(dataset.remainingSeconds, calculateClock(113).remainingSeconds);
  assert.equal(dataset.pressure, calculateGapClosedPercent(113));
  assert.equal(dataset.lastUpdated, '2026-09-28');
  assert.deepEqual(dataset.diagnostics, []);
  assert.equal(dataset.incidents.filter((incident) => !incident.editorial).length, 8);
  const newIncidents = dataset.incidents.filter((incident) => incident.assessment.date > '2026-09-18');
  assert.equal(newIncidents.length, 11);
  assert.equal(newIncidents.filter((incident) => incident.editorial).length, 7);
  assert.equal(newIncidents.filter((incident) => !incident.editorial).length, 4);
  assert.deepEqual(newIncidents.map((incident) => incident.assessment.score).sort((a, b) => a - b), [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepEqual(newIncidents.map((incident) => incident.effectivePoints).sort((a, b) => a - b), [0, 0, 1, 1, 2, 3, 4, 4, 5, 9, 9]);
  assert.equal(newIncidents[0].gapClosedPercent, newIncidents[3].gapClosedPercent);
  assert.equal(dataset.incidents.filter((incident) => incident.assessment.fullTrifecta).length, 3);
  assert.deepEqual(
    Object.fromEntries(['NO_MOVEMENT', 'CANARY', 'NOTABLE', 'SIGNIFICANT', 'CRITICAL', 'EXISTENTIAL'].map(
      (severity) => [severity, dataset.incidents.filter((incident) => incident.scoring.severity === severity).length],
    )),
    { NO_MOVEMENT: 7, CANARY: 14, NOTABLE: 12, SIGNIFICANT: 2, CRITICAL: 5, EXISTENTIAL: 0 },
  );
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.assessments.length, 2);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.editorials.length, 2);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-07-project-glasswing')?.editorialMatchesAssessment, true);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-08-turbotax-claude')?.editorialMatchesAssessment, false);
  assert.equal(dataset.incidents.find((incident) => incident.id === '2026-04-08-turbotax-claude')?.editorialAssessmentScore, 3);
  assert.ok(dataset.incidents.every((incident) => !incident.assessment.title.includes('cite')));
});

test('September coverage is grouped by event while reports retain their assessment versions', () => {
  const dataset = loadDataset(assessmentCsv, storyCsv);
  const medicare = dataset.incidents.find((incident) => incident.id === '2026-09-24-openai-medicare-agent')!;
  assert.equal(medicare.effectivePoints, 9);
  assert.equal(medicare.assessment.cveId, 'SKYNET-2026-0011');
  assert.deepEqual(medicare.assessments.map((assessment) => calculateRiskScore(assessment.scores).totalPoints).sort((a, b) => a - b), [9, 9, 10]);
  assert.deepEqual(medicare.editorials.map((editorial) => editorial.cveId).sort(), ['SKYNET-2026-0011', 'SKYNET-2026-0016', 'SKYNET-2026-0024']);
  const originalLinks = HISTORICAL_MANIFEST.find((entry) => entry.id === medicare.id)!.storyLinks;
  for (const link of originalLinks) {
    const report = medicare.editorials.find((editorial) => editorialContentFingerprint(editorial) === link.storyContentFingerprint)!;
    const assessment = medicare.assessments.find((version) => assessmentContentFingerprint(version) === link.assessmentContentFingerprint)!;
    assert.equal(report.cveId, assessment.cveId);
  }
  const dns = dataset.incidents.find((incident) => incident.id === '2026-09-25-openai-dns-sandbox')!;
  assert.equal(dns.effectivePoints, 4);
  assert.equal(dns.assessments.length, 2);
  assert.equal(dns.editorials.length, 2);
  assert.equal(dns.headline, 'The Sandbox Blocked the Web. DNS Had Other Ideas.');
  assert.equal(dns.editorialMatchesAssessment, true);
  const safa = dataset.incidents.find((incident) => incident.id === '2026-09-24-safa-private-standards')!;
  assert.equal(safa.assessments.length, 2);
  assert.equal(safa.effectivePoints, 1);
  const withoutCopies = withRows(assessmentCsv, (rows) => [...new Map(rows.map((row) => [JSON.stringify(row), row])).values()]);
  const distinct = loadDataset(withoutCopies, storyCsv);
  assert.deepEqual(distinct.diagnostics, []);
  assert.deepEqual(distinct.incidents, dataset.incidents);
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
  const baseline = loadDataset(assessmentCsv, storyCsv);
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
  assert.equal(dataset.incidents.length, baseline.incidents.length + 2);
  assert.equal(dataset.totalPoints, baseline.totalPoints + 2);
  assert.equal(dataset.matchedEditorialCount, baseline.matchedEditorialCount + 1);
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
  assert.ok(revised.diagnostics.some((message) => message.includes('Unreviewed assessment content')));

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
  assert.equal(ambiguous.matchedEditorialCount, storyRows.length);
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
  assert.equal(changedEditorial.matchedEditorialCount, storyRows.length - 1);
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
  assert.equal(approved.incidents[0].editorialAssessmentScore, 3);
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
  const baseline = loadDataset(assessmentCsv, storyCsv);
  const rows = parseCsv(assessmentCsv);
  const headers = [...Object.keys(rows[0]), 'event_id'];
  const withConflict = rows.map((row, index) => ({
    ...row,
    event_id: index === 0 ? 'wrong-historical-id' : '',
  }));
  const conflict = loadDataset(encodeCsv(headers, withConflict), storyCsv);
  assert.equal(conflict.incidents.length, baseline.incidents.length);
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
  assert.equal(corrected.incidents.length, baseline.incidents.length);
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

test('weights the Trifecta ladder and severity bands without a post-amplifier clamp', () => {
  assert.equal(MAX_SCORE, 17);
  assert.deepEqual(TRIFECTA_WEIGHTS, [0, 1, 3, 7]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(SEVERITY_DESCRIPTORS).map(([key, descriptor]) => [key, [descriptor.min, descriptor.max]])),
    { NO_MOVEMENT: [0, 0], CANARY: [1, 2], NOTABLE: [3, 4], SIGNIFICANT: [5, 6], CRITICAL: [7, 12], EXISTENTIAL: [13, 17] },
  );
  assert.match(CRITERIA.find(({ key }) => key === 't3')!.description, /Permission and capability/);
  assert.equal(CRITERIA.find(({ key }) => key === 'autonomy')!.scoreDescriptions?.length, 3);
  const score = (values: Partial<Record<string, number>>) => calculateRiskScore({
    t1: 0, t2: 0, t3: 0, governance: 0, autonomy: 0, erosion: 0, sentience: 0, physical: 0,
    ...values,
  });
  assert.deepEqual([0, 1, 2, 3].map((count) => score({
    t1: count >= 1 ? 1 : 0,
    t2: count >= 2 ? 1 : 0,
    t3: count >= 3 ? 1 : 0,
  }).trifectaPoints), [0, 1, 3, 7]);
  assert.equal(score({}).severity, 'NO_MOVEMENT');
  assert.equal(score({ t1: 1 }).severity, 'CANARY');
  assert.equal(score({ governance: 2 }).severity, 'CANARY');
  assert.equal(score({ t1: 1, governance: 2 }).severity, 'NOTABLE');
  assert.equal(score({ t1: 1, t2: 1, governance: 1 }).severity, 'NOTABLE');
  assert.equal(score({ t1: 1, governance: 2, autonomy: 2 }).severity, 'SIGNIFICANT');
  assert.equal(score({ t1: 1, t2: 1, governance: 2, autonomy: 1 }).severity, 'SIGNIFICANT');
  assert.equal(score({ t1: 1, t2: 1, t3: 1 }).severity, 'CRITICAL');
  assert.equal(score({ t1: 1, t2: 1, t3: 1, governance: 2, autonomy: 2, erosion: 1 }).severity, 'CRITICAL');
  assert.equal(score({ t1: 1, t2: 1, t3: 1, governance: 2, autonomy: 2, erosion: 2 }).severity, 'EXISTENTIAL');
  const maximum = score({ t1: 1, t2: 1, t3: 1, governance: 2, autonomy: 2, erosion: 2, sentience: 2, physical: 2 });
  assert.equal(maximum.totalPoints, 17);
  assert.equal(maximum.severity, 'EXISTENTIAL');
});

test('validates every scoring component strictly', () => {
  const valid = { t1: 0, t2: 0, t3: 0, governance: 0, autonomy: 0, erosion: 0, sentience: 0, physical: 0 };
  assert.throws(() => calculateRiskScore({ ...valid, t1: 0.5 }), /t1 must be an integer/);
  assert.throws(() => calculateRiskScore({ ...valid, t2: 2 }), /t2 must be an integer/);
  assert.throws(() => calculateRiskScore({ ...valid, autonomy: 3 }), /autonomy must be an integer/);
  assert.throws(() => calculateRiskScore({ ...valid, erosion: -1 }), /erosion must be an integer/);
  const missing = { ...valid };
  delete (missing as Partial<typeof valid>).physical;
  assert.throws(() => calculateRiskScore(missing), /physical must be an integer/);
  assert.throws(() => calculateRiskScore({ ...valid, unexpected: 0 }), /Unknown scoring component/);
  assert.throws(() => calculateClock(Number.NaN), /non-negative finite/);
});

test('scores all 1,944 valid configurations and all 6,480 amplifier increments', () => {
  const amplifierKeys = ['governance', 'autonomy', 'erosion', 'sentience', 'physical'] as const;
  let configurations = 0;
  let transitions = 0;
  for (let trifectaMask = 0; trifectaMask < 8; trifectaMask += 1) {
    for (let encodedAmplifiers = 0; encodedAmplifiers < 3 ** 5; encodedAmplifiers += 1) {
      let value = encodedAmplifiers;
      const scores: Record<string, number> = {
        t1: trifectaMask & 1 ? 1 : 0,
        t2: trifectaMask & 2 ? 1 : 0,
        t3: trifectaMask & 4 ? 1 : 0,
        governance: 0,
        autonomy: 0,
        erosion: 0,
        sentience: 0,
        physical: 0,
      };
      for (const key of amplifierKeys) {
        scores[key] = value % 3;
        value = Math.floor(value / 3);
      }
      const result = calculateRiskScore(scores);
      const trifectaCount = scores.t1 + scores.t2 + scores.t3;
      const amplifierPoints = amplifierKeys.reduce((sum, key) => sum + scores[key], 0);
      assert.equal(result.trifectaCount, trifectaCount);
      assert.equal(result.trifectaPoints, TRIFECTA_WEIGHTS[trifectaCount]);
      assert.equal(result.amplifierPoints, amplifierPoints);
      assert.equal(result.totalPoints, result.trifectaPoints + amplifierPoints);
      assert.ok(result.totalPoints >= 0 && result.totalPoints <= MAX_SCORE);
      configurations += 1;
      for (const key of amplifierKeys) {
        if (scores[key] < 2) {
          const incremented = calculateRiskScore({ ...scores, [key]: scores[key] + 1 });
          assert.equal(incremented.totalPoints, result.totalPoints + 1);
          transitions += 1;
        }
      }
    }
  }
  assert.equal(configurations, 1944);
  assert.equal(transitions, 6480);
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

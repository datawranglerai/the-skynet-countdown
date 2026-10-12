import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsv } from '../src/lib/csv.ts';
import { buildDatabaseDataset, exportDatabaseCsv } from './dataset.ts';
import { resolveEventIdentityForest } from './event-identity.ts';
import { readDatabaseSnapshotFromClient } from './postgres.ts';
import type { DatabaseEventParentRow, DatabaseEventRow, DatabaseHistoryRow, DatabaseSnapshot } from './storage-types.ts';

const assessmentRows = parseCsv(await readFile(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url), 'utf8'));
const storyRows = parseCsv(await readFile(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url), 'utf8'));

function event(id: string, slug: string, assessmentVersion: string, storyVersion: string): DatabaseEventRow {
  return {
    id, slug, public_id: `SKYNET-2026-${id.padStart(4, '0')}`,
    selected_assessment_id: id, selected_assessment_version_key: assessmentVersion,
    selected_story_id: id, selected_story_version_key: storyVersion,
    selection_rationale: 'The canonical root remains selected.', bootstrap_completed_at: null,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function history(
  id: string, kind: 'assessment' | 'story', eventId: string, versionKey: string,
  payload: Record<string, unknown>, assessmentVersionKey: string | null = null,
): DatabaseHistoryRow {
  return {
    id, kind, source_row_id: id, event_id: eventId, version_key: versionKey,
    assessment_version_key: assessmentVersionKey, payload, provenance: 'test',
    provenance_details: {}, import_key: null, recorded_at: '2026-01-01T00:00:00.000Z',
  };
}

function parent(child: string, root: string): DatabaseEventParentRow {
  return { child_event_id: child, parent_event_id: root, merge_decision_id: '10', created_at: '2026-02-01T00:00:00.000Z' };
}

test('resolves an event-parent forest and rejects unsafe identity graphs', () => {
  const events = [event('1', 'root', 'a1', 's1'), event('2', 'child', 'a2', 's2'), event('3', 'leaf', 'a3', 's3')];
  const resolved = resolveEventIdentityForest(events, [parent('2', '1'), parent('3', '2')]);
  assert.equal(resolved.rootByEventId.get('3'), '1');
  assert.deepEqual(resolved.eventIdsByRoot.get('1'), ['1', '2', '3']);
  assert.throws(() => resolveEventIdentityForest(events, [parent('2', '2')]), /cannot parent itself/);
  assert.throws(() => resolveEventIdentityForest(events, [parent('9', '1')]), /unknown child/);
  assert.throws(() => resolveEventIdentityForest(events, [parent('2', '9')]), /unknown parent/);
  assert.throws(() => resolveEventIdentityForest(events, [parent('2', '3'), parent('3', '2')]), /cycle/);
  assert.throws(() => resolveEventIdentityForest(events, [parent('2', '1'), parent('2', '3')]), /multiple parents/);
});

test('merged events count the root score once while retaining every version and old route', () => {
  const rootAssessment: Record<string, unknown> = { ...assessmentRows[0], incident_date: '2026-01-01', source_url: 'https://example.com/root' };
  const childAssessment: Record<string, unknown> = {
    ...assessmentRows[1], incident_date: '2026-01-02', source_url: 'https://example.com/child',
    t1_score: '1', t2_score: '1', t3_score: '1', full_trifecta: 'TRUE', total_score: '13', classification: 'EXISTENTIAL',
    amp_governance_vacuum_score: '2', amp_autonomy_score: '2', amp_capability_erosion_score: '2',
    amp_sentience_score: '2', amp_physical_score: '2',
  };
  const rootStory = { ...storyRows[0], cve_id: rootAssessment.cve_id, headline: 'Canonical report' };
  const childStory = { ...storyRows[1], cve_id: childAssessment.cve_id, headline: 'Duplicate coverage' };
  const rootEvent = event('1', 'canonical-root', 'assessment:1:1', 'story:1:1');
  rootEvent.selection_rationale = 'The only assessment source for this event is canonical.';
  const snapshot: DatabaseSnapshot = {
    events: [rootEvent, event('2', 'old-child-route', 'assessment:2:1', 'story:2:1')],
    assessments: [], stories: [], eventParents: [parent('2', '1')],
    history: [
      history('1', 'assessment', '1', 'assessment:1:1', rootAssessment),
      history('2', 'story', '1', 'story:1:1', rootStory, 'assessment:1:1'),
      history('3', 'assessment', '2', 'assessment:2:1', childAssessment),
      history('4', 'story', '2', 'story:2:1', childStory, 'assessment:2:1'),
    ],
    dataUpdatedAt: '2026-02-01T00:00:00.000Z',
  };
  const dataset = buildDatabaseDataset(snapshot);
  assert.equal(dataset.incidents.length, 1);
  assert.equal(dataset.incidents[0].id, 'canonical-root');
  assert.deepEqual(dataset.incidents[0].routeAliases, ['old-child-route']);
  assert.equal(dataset.incidents[0].assessment.sourceUrl, 'https://example.com/root');
  assert.match(dataset.incidents[0].selectionRationale, /Duplicate coverage is grouped/);
  assert.doesNotMatch(dataset.incidents[0].selectionRationale, /only assessment source/i);
  assert.equal(dataset.incidents[0].assessments.length, 2);
  assert.equal(dataset.incidents[0].editorials.length, 2);
  assert.equal(dataset.totalPoints, dataset.incidents[0].scoring.totalPoints);
  assert.notEqual(dataset.totalPoints, 17);
  assert.equal(dataset.assessmentCount, 2);
  assert.equal(dataset.editorialCount, 2);

  const exported = exportDatabaseCsv(snapshot, 'assessments');
  assert.match(exported, /event_id,public_id,resolved_event_id,resolved_public_id/);
  assert.match(exported, /2,SKYNET-2026-0002,1,SKYNET-2026-0001/);
});

test('database datasets bind clock entries by identity when a frozen alias changes same-day ordering', () => {
  const rootAssessment = {
    ...assessmentRows[0], incident_date: '2026-01-02', source_url: 'https://example.com/renamed-root',
  };
  const childAssessment = {
    ...assessmentRows[1], incident_date: '2026-01-02', source_url: 'https://example.com/old-anchor',
  };
  const middleAssessment = {
    ...assessmentRows[2], incident_date: '2026-01-02', source_url: 'https://example.com/middle',
  };
  const root = event('1', 'renamed-root', 'assessment:1:1', 'story:unused');
  const child = event('2', 'bravo', 'assessment:2:1', 'story:unused');
  const middle = event('3', 'middle', 'assessment:3:1', 'story:unused');
  for (const value of [root, child, middle]) {
    value.selected_story_id = null;
    value.selected_story_version_key = null;
  }
  const snapshot: DatabaseSnapshot = {
    events: [root, child, middle], assessments: [], stories: [], eventParents: [parent('2', '1')],
    history: [
      history('1', 'assessment', '1', 'assessment:1:1', rootAssessment),
      history('2', 'assessment', '2', 'assessment:2:1', childAssessment),
      history('3', 'assessment', '3', 'assessment:3:1', middleAssessment),
    ],
    dataUpdatedAt: '2026-01-03T00:00:00.000Z',
  };
  const dataset = buildDatabaseDataset(snapshot, snapshot.dataUpdatedAt, {
    approvedBy: 'The editor', approvedAt: '2026-01-03T12:00:00.000Z',
    effectiveAfter: { date: '2026-01-02', incidentId: 'bravo' },
    rationale: 'Published evidence establishes the phase transition.',
    editorialUrl: '#/reports/event-horizon-entry',
  });
  assert.deepEqual(dataset.incidents.map((incident) => incident.id), ['renamed-root', 'middle']);
  assert.deepEqual(dataset.incidents.map((incident) => incident.clockPhase), ['approach', 'event-horizon']);
  assert.equal(dataset.clock.transition?.afterIncidentId, 'renamed-root');
  assert.equal(dataset.incidents[0].remainingSeconds, dataset.clock.transition?.remainingSecondsBefore);
  assert.ok(dataset.incidents[1].remainingSeconds <= 120);
});

test('pre-deduplication schemas read as an empty parent forest', async () => {
  const queries: string[] = [];
  const client = {
    async query(sql: string) {
      queries.push(sql);
      if (sql.includes("to_regclass('public.event_parents')")) {
        return { rows: [{ event_parents: null, event_identity_decisions: null }] };
      }
      if (sql.includes('data_updated_at')) return { rows: [{ data_updated_at: '2026-01-01T00:00:00.000Z' }] };
      return { rows: [] };
    },
  };
  const snapshot = await readDatabaseSnapshotFromClient(client as never);
  assert.deepEqual(snapshot.eventParents, []);
  assert.equal(queries.some((sql) => sql.includes('FROM public.event_parents ORDER BY')), false);
  assert.equal(queries.some((sql) => sql.includes('MAX(created_at) FROM public.event_identity_decisions')), false);
});

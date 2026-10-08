import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { applyMigrationPlan, buildMigrationPlan, inspectMigrationDatabase } from '../scripts/migrate-postgres.ts';
import { loadDataset, parseCsv, parseAssessmentRecord, parseEditorialRecord } from '../src/lib/index.ts';
import { assessmentPayloadToRecord, buildDatabaseDataset, exportDatabaseCsv, storyPayloadToRecord } from './dataset.ts';
import { createPostgresPool, readDatabaseSnapshotFromClient } from './postgres.ts';
import type { DatabaseSnapshot } from './storage-types.ts';

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function insert(client: PoolClient, table: 'assessments' | 'stories', row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.${table} (${keys.map(quote).join(',')}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING id`,
    keys.map((key) => row[key]),
  );
  return result.rows[0].id;
}

function assertOriginalFields(before: Record<string, unknown>[], after: Record<string, unknown>[]) {
  for (const original of before) {
    const current = after.find((row) => row.id === original.id);
    assert.ok(current, `Original row ${original.id} remains present`);
    for (const [field, value] of Object.entries(original)) {
      if (field === 'updated_at') continue;
      const normalize = (entry: unknown) => entry instanceof Date ? entry.toISOString() : entry;
      assert.deepEqual(normalize(current[field]), normalize(value), `Row ${original.id}: ${field}`);
    }
  }
}

function assertCsvCoverage(snapshot: DatabaseSnapshot, plan: ReturnType<typeof buildMigrationPlan>) {
  const assessments = new Map(snapshot.history.filter((row) => row.kind === 'assessment').map((row) => [
    row.version_key, parseAssessmentRecord(assessmentPayloadToRecord(row.payload), 0, { validateCveFormat: false }).contentFingerprint,
  ]));
  const storyVersions = snapshot.history.filter((row) => row.kind === 'story');
  for (const planned of plan.stories) {
    const history = storyVersions.find((row) => parseEditorialRecord(storyPayloadToRecord(row.payload), 0, { validateCveFormat: false }).contentFingerprint === planned.contentFingerprint);
    assert.ok(history, 'Every original editorial remains available');
    assert.equal(assessments.get(history.assessment_version_key!), planned.linkedAssessmentFingerprint, 'Editorial retains its exact assessed version');
  }
  for (const kind of ['assessment', 'story'] as const) {
    const rows = snapshot.history.filter((row) => row.kind === kind).flatMap((row) => row.provenance_details.csv_row_numbers ?? []);
    assert.equal(rows.length, kind === 'assessment' ? 63 : 38, 'All source row provenance survives');
    assert.equal(new Set(rows).size, rows.length, 'Each source row is accounted for once');
  }
}

test('full PostgreSQL migration preserves history, rolls back, and tolerates future ingestion', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const base = new URL(process.env.TEST_DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !base.pathname.startsWith('/skynet_test')) {
    throw new Error('Migration integration tests require an isolated local skynet_test database');
  }
  const admin = createPostgresPool(base.toString());
  const name = `skynet_migration_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${quote(name)}`);
  base.pathname = `/${name}`;
  const pool = createPostgresPool(base.toString());
  const client = await pool.connect();
  try {
    const [ingress, schema, assessmentCsv, storyCsv] = await Promise.all([
      readFile(new URL('../db/000_ingress_schema.sql', import.meta.url), 'utf8'),
      readFile(new URL('../db/001_events_and_history.sql', import.meta.url), 'utf8'),
      readFile(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url), 'utf8'),
      readFile(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url), 'utf8'),
    ]);
    await client.query(ingress);
    await client.query('BEGIN');
    await client.query(schema);
    const empty = buildDatabaseDataset(await readDatabaseSnapshotFromClient(client));
    assert.equal(empty.incidents.length, 0);
    assert.equal(empty.remainingSeconds, 900);
    await client.query('ROLLBACK');
    const newest = parseCsv(assessmentCsv).slice(39, 51);
    const parentIds = new Map<string, string>();
    for (const row of newest) parentIds.set(row.cve_id, await insert(client, 'assessments', row));
    for (const row of parseCsv(storyCsv).slice(30)) {
      await insert(client, 'stories', {
        ...row, assessment_id: parentIds.get(row.cve_id),
        headline: `Database rewrite: ${row.headline}`, our_take: `Rewritten in PostgreSQL. ${row.our_take}`,
      });
    }
    const originalsA = (await client.query('SELECT * FROM public.assessments ORDER BY id')).rows;
    const originalsS = (await client.query('SELECT * FROM public.stories ORDER BY id')).rows;
    const plan = buildMigrationPlan(assessmentCsv, storyCsv);
    const inspection = await inspectMigrationDatabase(client, plan);
    assert.equal(inspection.existingAssessments, 12);
    assert.equal(inspection.existingStories, 8);
    assert.equal(inspection.missingSourceUrls.length, 31);
    assert.equal(inspection.rewrittenStoryIds.length, 8);

    await assert.rejects(applyMigrationPlan(client, { ...plan, expectedPoints: -1 }, { schemaSql: schema }), /parity/i);
    assert.equal((await client.query("SELECT to_regclass('public.events') AS events")).rows[0].events, null, 'Failed imports also roll back schema changes');
    assertOriginalFields(originalsA, (await client.query('SELECT * FROM public.assessments')).rows);
    assertOriginalFields(originalsS, (await client.query('SELECT * FROM public.stories')).rows);

    await applyMigrationPlan(client, plan, { schemaSql: schema });
    const snapshot = await readDatabaseSnapshotFromClient(client);
    const dataset = buildDatabaseDataset(snapshot);
    const baseline = loadDataset(assessmentCsv, storyCsv);
    assert.equal(snapshot.assessments.length, 43);
    assert.equal(snapshot.stories.length, 34);
    assert.equal(dataset.incidents.length, 40);
    assert.equal(dataset.totalPoints, 113);
    assert.equal(dataset.editorialCount, 46);
    assert.deepEqual(dataset.diagnostics, []);
    assertOriginalFields(originalsA, (await client.query('SELECT * FROM public.assessments')).rows);
    assertOriginalFields(originalsS, (await client.query('SELECT * FROM public.stories')).rows);
    assertCsvCoverage(snapshot, plan);
    for (const kind of ['assessments', 'stories'] as const) {
      const exported = parseCsv(exportDatabaseCsv(snapshot, kind));
      const importedRows = exported.reduce((sum, row) => sum + JSON.parse(row.csv_row_numbers).length, 0);
      assert.equal(importedRows, kind === 'assessments' ? 63 : 38);
      assert.ok(exported.every((row) => row.public_id.startsWith('SKYNET-')));
    }
    const latestAssessments = new Map(plan.assessments.map((entry) => [entry.sourceUrl, entry.contentFingerprint]));
    for (const row of snapshot.assessments) {
      const fingerprint = parseAssessmentRecord(assessmentPayloadToRecord(row as unknown as Record<string, unknown>), 0, { validateCveFormat: false }).contentFingerprint;
      assert.equal(fingerprint, latestAssessments.get(row.source_url), 'Current ingress rows keep the latest source version');
    }
    for (const incident of baseline.incidents.filter((entry) => entry.assessment.date < '2026-09-01')) {
      const migrated = dataset.incidents.find((entry) => entry.id === incident.id)!;
      assert.equal(migrated.headline, incident.headline, 'Reviewed historical headlines survive');
      assert.equal(migrated.editorialAssessmentScore, incident.editorialAssessmentScore);
      assert.equal(migrated.editorialMatchesAssessment, incident.editorialMatchesAssessment);
    }
    const historyCount = snapshot.history.length;
    const stableIdentities = dataset.incidents.map(({ id, publicId }) => ({ id, publicId }));
    await applyMigrationPlan(client, plan, { schemaSql: schema });
    assert.equal((await readDatabaseSnapshotFromClient(client)).history.length, historyCount, 'Repeated imports do not add versions');

    await client.query('UPDATE public.assessments SET scoring_notes = scoring_notes WHERE id = $1', [originalsA[0].id]);
    await client.query('UPDATE public.stories SET headline = headline WHERE id = $1', [originalsS[0].id]);
    assert.equal((await readDatabaseSnapshotFromClient(client)).history.length, historyCount, 'No-op upserts do not add versions');

    await client.query(`UPDATE public.assessments SET scoring_notes = 'New live rationale' WHERE id = $1`, [originalsA[0].id]);
    await client.query(`UPDATE public.stories SET headline = 'A new live headline' WHERE id = $1`, [originalsS[0].id]);
    const future = { ...newest[0], cve_id: 'UPSTREAM-OPAQUE', incident_title: 'Future live event', incident_date: '2027-01-02', source_url: 'https://example.com/future-live-event' };
    const futureStory = { ...parseCsv(storyCsv)[0], cve_id: 'ANOTHER-UPSTREAM-LABEL', headline: 'A future report' };
    const assessmentColumns = Object.keys(future);
    const storyColumns = Object.keys(futureStory);
    const atomicUpsert = `WITH saved_assessment AS (
      INSERT INTO public.assessments (${assessmentColumns.map(quote).join(',')})
      SELECT ${assessmentColumns.map(quote).join(',')} FROM jsonb_populate_record(NULL::public.assessments,$1::jsonb)
      ON CONFLICT (source_url) DO UPDATE SET ${assessmentColumns.filter((key) => key !== 'source_url').map((key) => `${quote(key)}=EXCLUDED.${quote(key)}`).join(',')}, updated_at=CURRENT_TIMESTAMP
      RETURNING id
    ) INSERT INTO public.stories (assessment_id,${storyColumns.map(quote).join(',')})
      SELECT a.id,${storyColumns.map((key) => `s.${quote(key)}`).join(',')} FROM saved_assessment a CROSS JOIN jsonb_populate_record(NULL::public.stories,$2::jsonb) s
      ON CONFLICT (assessment_id) DO UPDATE SET ${storyColumns.map((key) => `${quote(key)}=EXCLUDED.${quote(key)}`).join(',')}, updated_at=CURRENT_TIMESTAMP`;
    await client.query(atomicUpsert, [JSON.stringify(future), JSON.stringify(futureStory)]);
    const afterInsert = (await readDatabaseSnapshotFromClient(client)).history.length;
    await client.query(atomicUpsert, [JSON.stringify(future), JSON.stringify(futureStory)]);
    assert.equal((await readDatabaseSnapshotFromClient(client)).history.length, afterInsert, 'Atomic repeated n8n upserts add no phantom events or history');
    await client.query(atomicUpsert, [JSON.stringify({ ...future, scoring_notes: 'Changed assessment; identical editorial text' }), JSON.stringify(futureStory)]);
    const afterChange = await readDatabaseSnapshotFromClient(client);
    assert.equal(afterChange.history.length, afterInsert + 2, 'Unchanged story text records its new assessment relationship');
    const liveSource = afterChange.assessments.find((row) => row.source_url === future.source_url)!;
    const liveEvent = afterChange.events.find((row) => row.id === liveSource.event_id)!;
    const liveStory = afterChange.history.find((row) => row.version_key === liveEvent.selected_story_version_key)!;
    assert.equal(liveStory.assessment_version_key, liveEvent.selected_assessment_version_key);
    const liveBefore = buildDatabaseDataset(await readDatabaseSnapshotFromClient(client));
    assert.equal(liveBefore.incidents.length, 41);
    const liveCount = (await readDatabaseSnapshotFromClient(client)).history.length;
    await applyMigrationPlan(client, plan, { schemaSql: schema });
    const liveAfter = buildDatabaseDataset(await readDatabaseSnapshotFromClient(client));
    assert.equal(liveAfter.incidents.length, 41);
    assert.equal(liveAfter.totalPoints, liveBefore.totalPoints);
    assert.equal((await readDatabaseSnapshotFromClient(client)).history.length, liveCount, 'Rerunning after ingestion is a no-op');
    assert.deepEqual(liveAfter.incidents.filter((entry) => stableIdentities.some(({ id }) => id === entry.id)).map(({ id, publicId }) => ({ id, publicId })), stableIdentities);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
    await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
    await admin.end();
  }
});

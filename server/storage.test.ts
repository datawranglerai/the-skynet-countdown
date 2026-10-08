import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMigrationPlan } from '../scripts/migrate-postgres.ts';
import { buildDatabaseDataset, exportDatabaseCsv } from './dataset.ts';
import { createPostgresPool, readDatabaseSnapshot } from './postgres.ts';

const assessmentCsv = await readFile(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url), 'utf8');
const storyCsv = await readFile(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url), 'utf8');

function localTestPool() {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.startsWith('/skynet_test')) {
    throw new Error('PostgreSQL tests require an isolated local skynet_test database');
  }
  return createPostgresPool(url.toString());
}

test('builds a complete deterministic migration plan from the audited CSV evidence', () => {
  const plan = buildMigrationPlan(assessmentCsv, storyCsv);
  assert.equal(plan.events.length, 40);
  assert.equal(plan.assessments.length, 51);
  assert.equal(plan.assessments.reduce((sum, version) => sum + version.csvRowNumbers.length, 0), 63);
  assert.equal(plan.stories.length, 38);
  assert.equal(plan.expectedPoints, 113);
  assert.equal(new Set(plan.events.map((event) => event.publicId)).size, 40);
  assert.ok(plan.events.every((event) => /^SKYNET-\d{4}-\d{4,}$/.test(event.publicId)));
});

test('reads the migrated PostgreSQL dataset and exports its audit history', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = localTestPool();
  try {
    const snapshot = await readDatabaseSnapshot(pool);
    const dataset = buildDatabaseDataset(snapshot, '2026-09-29T00:00:00.000Z');
    assert.equal(dataset.incidents.length, 40);
    assert.equal(dataset.totalPoints, 113);
    assert.ok(Math.abs(dataset.remainingSeconds - 900 * 2 ** (-113 / 1000)) < 1e-9);
    for (const incident of dataset.incidents) {
      assert.ok(Math.abs(incident.remainingSeconds - 900 * 2 ** (-incident.cumulativePoints / 1000)) < 1e-9);
      assert.ok(Math.abs(incident.gapClosedPercent - 100 * (1 - 2 ** (-incident.effectivePoints / 1000))) < 1e-12);
    }
    assert.deepEqual(dataset.diagnostics, []);
    assert.match(exportDatabaseCsv(snapshot, 'assessments'), /^cve_id,/);
    assert.match(exportDatabaseCsv(snapshot, 'stories'), /^cve_id,/);
  } finally {
    await pool.end();
  }
});

test('database triggers create one event and retain multiple same-transaction updates', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const pool = localTestPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO public.assessments (
        cve_id, incident_title, incident_date, source_url, classification, total_score,
        clock_delta_minutes, full_trifecta, t1_score, t1_rationale, t2_score, t2_rationale,
        t3_score, t3_rationale, amp_governance_vacuum_score, amp_governance_vacuum_rationale,
        amp_autonomy_score, amp_autonomy_rationale, amp_capability_erosion_score,
        amp_capability_erosion_rationale, amp_sentience_score, amp_sentience_rationale,
        amp_physical_score, amp_physical_rationale, is_leading_indicator,
        leading_indicator_note, scoring_notes
      )
      SELECT
        'UPSTREAM-TEST', 'Future automatic insert', DATE '2027-01-02',
        'https://example.com/future-trigger-test', classification, total_score,
        clock_delta_minutes, full_trifecta, t1_score, t1_rationale, t2_score, t2_rationale,
        t3_score, t3_rationale, amp_governance_vacuum_score, amp_governance_vacuum_rationale,
        amp_autonomy_score, amp_autonomy_rationale, amp_capability_erosion_score,
        amp_capability_erosion_rationale, amp_sentience_score, amp_sentience_rationale,
        amp_physical_score, amp_physical_rationale, is_leading_indicator,
        leading_indicator_note, scoring_notes
      FROM public.assessments ORDER BY id LIMIT 1 RETURNING id
    `);
    const assessmentId = inserted.rows[0].id;
    await client.query(`UPDATE public.assessments SET scoring_notes = 'first update' WHERE id = $1`, [assessmentId]);
    await client.query(`UPDATE public.assessments SET scoring_notes = 'second update' WHERE id = $1`, [assessmentId]);
    const result = await client.query<{ events: number; versions: number }>(`
      SELECT
        (SELECT count(*)::int FROM public.events e JOIN public.assessments a ON a.event_id = e.id WHERE a.id = $1) AS events,
        (SELECT count(*)::int FROM public.record_history WHERE kind = 'assessment' AND source_row_id = $1) AS versions
    `, [assessmentId]);
    assert.deepEqual(result.rows[0], { events: 1, versions: 3 });

    await client.query('SAVEPOINT append_only_probe');
    await assert.rejects(
      client.query(`UPDATE public.record_history SET provenance = 'changed' WHERE source_row_id = $1`, [assessmentId]),
      /append-only/,
    );
    await client.query('ROLLBACK TO SAVEPOINT append_only_probe');
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { buildDatabaseDataset } from './dataset.ts';
import { createPostgresPool, readDatabaseSnapshotFromClient } from './postgres.ts';

const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

async function insertEvent(client: PoolClient, suffix: string, date: string) {
  const assessment = await client.query<{ id: string }>(`
    INSERT INTO public.assessments (
      cve_id, incident_title, incident_date, source_url, classification, total_score,
      clock_delta_minutes, full_trifecta, t1_score, t1_rationale, t2_score, t2_rationale,
      t3_score, t3_rationale, amp_governance_vacuum_score, amp_governance_vacuum_rationale,
      amp_autonomy_score, amp_autonomy_rationale, amp_capability_erosion_score,
      amp_capability_erosion_rationale, amp_sentience_score, amp_sentience_rationale,
      amp_physical_score, amp_physical_rationale, is_leading_indicator,
      leading_indicator_note, scoring_notes
    ) VALUES (
      $1, $2, $3, $4, 'SIGNIFICANT', 5, 0, false,
      1, 'The Orion research agent independently selected an external target.',
      1, 'The Orion research agent used a live credential without approval.',
      0, 'No irreversible harm was demonstrated.',
      1, 'The deployment crossed a documented governance boundary.',
      1, 'The run continued through several autonomous tool calls.',
      1, 'The result exposed a material control weakness.',
      0, 'No evidence of sentience was reported.',
      0, 'No physical actuator was involved.',
      true, 'The incident is a leading indicator for agent access controls.',
      $5
    ) RETURNING id, event_id
  `, [
    `TEST-${suffix}`,
    `Orion research agent accessed the same protected system ${suffix}`,
    date,
    `https://example.test/orion-${suffix}`,
    `Assessment ${suffix}: the same Orion run accessed the protected system and exposed the same control failure.`,
  ]);
  const assessmentId = assessment.rows[0].id;
  const event = await client.query<{ event_id: string }>('SELECT event_id FROM public.assessments WHERE id = $1', [assessmentId]);
  await client.query(`
    INSERT INTO public.stories (
      assessment_id, cve_id, headline, severity_label, clock_delta_label,
      metadata_line, the_story, our_take, updated_clock_position
    ) VALUES ($1, $2, $3, 'SIGNIFICANT', '+0 MINUTES', $4, $5, $6, '15:00')
  `, [
    assessmentId,
    `TEST-${suffix}`,
    `The Orion agent found the same door ${suffix}`,
    `${date} · TEST-${suffix}`,
    `The Orion research agent accessed the protected system during the same evaluation run. Source variant ${suffix}.`,
    `This record ${suffix} describes the same concrete occurrence and preserves its source-specific evidence.`,
  ]);
  return { assessmentId, eventId: event.rows[0].event_id };
}

type CandidateSide = {
  event_id: string;
  public_id: string;
  slug: string;
  fingerprint: string;
  incident_date: string;
  evidence: string;
};
type CandidatePair = { left: CandidateSide; right: CandidateSide };

async function candidates(client: PoolClient) {
  const result = await client.query<{ pair: CandidatePair }>('SELECT pair FROM public.skynet_dedup_candidates(100, 45)');
  return result.rows.map(({ pair }) => pair);
}

function findPair(pairs: CandidatePair[], eventA: string, eventB: string) {
  const ids = [eventA, eventB].sort((left, right) => BigInt(left) < BigInt(right) ? -1 : 1);
  const pair = pairs.find((entry) => entry.left.event_id === ids[0] && entry.right.event_id === ids[1]);
  assert.ok(pair, `Expected candidate pair ${ids.join('/')}`);
  return pair;
}

function classification(pair: CandidatePair, confidence = 0.99, relation = 'same_event') {
  return {
    relation,
    confidence,
    same_actor: true,
    same_action: true,
    same_occurrence: true,
    material_followup: false,
    evidence_left: pair.left.evidence.slice(0, 80),
    evidence_right: pair.right.evidence.slice(0, 80),
    rationale: 'Both sources describe the same actor, action and occurrence.',
  };
}

async function decide(
  client: PoolClient,
  pair: CandidatePair,
  body: Record<string, unknown> = classification(pair),
  autoMerge = true,
) {
  const result = await client.query<{ result: Record<string, unknown> }>(
    'SELECT public.skynet_record_duplicate_decision($1::jsonb,$2::jsonb,$3::jsonb) AS result',
    [pair, body, { execution_id: 'integration-test', model: 'test-model', prompt_version: 'test-v1', auto_merge: autoMerge }],
  );
  return result.rows[0].result;
}

test('event reconciliation is reversible, stale-safe, idempotent and append-only', {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  const base = new URL(process.env.TEST_DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !base.pathname.startsWith('/skynet_test')) {
    throw new Error('Reconciliation tests require an isolated local skynet_test database');
  }
  const admin = createPostgresPool(base.toString());
  const name = `skynet_reconciliation_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE DATABASE ${quote(name)}`);
  base.pathname = `/${name}`;
  const pool = createPostgresPool(base.toString());
  const client = await pool.connect();
  try {
    const [ingress, events, reconciliation] = await Promise.all([
      readFile(new URL('../db/000_ingress_schema.sql', import.meta.url), 'utf8'),
      readFile(new URL('../db/001_events_and_history.sql', import.meta.url), 'utf8'),
      readFile(new URL('../db/002_event_reconciliation.sql', import.meta.url), 'utf8'),
    ]);
    await client.query(ingress);
    await assert.rejects(client.query(reconciliation), (error: unknown) => {
      const failure = error as { code?: string; message?: string; detail?: string; hint?: string };
      assert.equal(failure.code, '55000');
      assert.match(failure.message ?? '', /prerequisites are missing in database/);
      assert.match(failure.detail ?? '', /public\.events.*public\.record_history/);
      assert.match(failure.hint ?? '', /same Neon project, branch and database/);
      return true;
    });
    await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT to_regclass('public.event_identity_decisions') AS relation")).rows[0].relation,
      null, 'A missing prerequisite stops reconciliation before any tables are created');
    await client.query(events);
    await client.query(reconciliation);
    await client.query(reconciliation);

    const a = await insertEvent(client, 'A', '2026-10-01');
    const b = await insertEvent(client, 'B', '2026-10-02');
    const c = await insertEvent(client, 'C', '2026-10-03');
    const d = await insertEvent(client, 'D', '2026-10-04');

    const originalSnapshot = await readDatabaseSnapshotFromClient(client);
    const originalDataset = buildDatabaseDataset(originalSnapshot);
    assert.equal(originalDataset.incidents.length, 4);
    assert.equal(originalDataset.totalPoints, 24);
    assert.equal(originalSnapshot.history.length, 8);
    await client.query("SET TIME ZONE 'UTC'");
    const utcFingerprint = (await client.query('SELECT public.skynet_event_fingerprint($1) AS fingerprint', [a.eventId])).rows[0].fingerprint;
    await client.query("SET TIME ZONE 'Europe/London'");
    const londonFingerprint = (await client.query('SELECT public.skynet_event_fingerprint($1) AS fingerprint', [a.eventId])).rows[0].fingerprint;
    assert.equal(londonFingerprint, utcFingerprint, 'Fingerprints do not depend on the caller time zone');
    await client.query("SET TIME ZONE 'UTC'");

    const bcPair = findPair(await candidates(client), b.eventId, c.eventId);
    assert.doesNotMatch(bcPair.left.evidence, /Scoring notes:|Trifecta:|Amplifiers:|Our take:/);
    assert.doesNotMatch(bcPair.left.evidence, /No evidence of sentience/);
    assert.match(bcPair.left.evidence, /Title:|Story:/);
    const mergedBc = await decide(client, bcPair);
    assert.equal(mergedBc.action, 'merge');
    assert.equal(mergedBc.canonical_event_id, b.eventId, 'The older/lower identity is canonical');
    assert.equal(mergedBc.child_event_id, c.eventId);
    assert.equal((await decide(client, bcPair)).idempotent, true, 'Repeating an identical model result is a no-op');
    const afterFirstMerge = await readDatabaseSnapshotFromClient(client);
    assert.equal(buildDatabaseDataset(afterFirstMerge).incidents.length, 3);
    assert.equal(buildDatabaseDataset(afterFirstMerge).totalPoints, 18);
    assert.equal(afterFirstMerge.history.length, originalSnapshot.history.length, 'Grouping does not rewrite evidence history');

    const abPair = findPair(await candidates(client), a.eventId, b.eventId);
    const mergedAb = await decide(client, abPair);
    assert.equal(mergedAb.action, 'merge');
    assert.equal(mergedAb.canonical_event_id, a.eventId);
    assert.equal((await client.query('SELECT public.skynet_event_root($1) AS root', [c.eventId])).rows[0].root, a.eventId);
    const afterSecondMerge = buildDatabaseDataset(await readDatabaseSnapshotFromClient(client));
    assert.equal(afterSecondMerge.incidents.length, 2);
    assert.equal(afterSecondMerge.totalPoints, 12);
    assert.equal(afterSecondMerge.incidents.find((incident) => incident.eventKey === a.eventId)?.routeAliases?.length, 2);

    await client.query('BEGIN');
    await client.query('SAVEPOINT cycle_probe');
    await assert.rejects(
      client.query('UPDATE public.event_parents SET parent_event_id = $1 WHERE child_event_id = $2', [c.eventId, b.eventId]),
      /cycle/,
    );
    await client.query('ROLLBACK TO SAVEPOINT cycle_probe');
    await client.query('COMMIT');

    const unmerged = await client.query<{ result: Record<string, unknown> }>(
      'SELECT public.skynet_unmerge_event($1,$2,$3,$4) AS result',
      [b.eventId, mergedAb.decision_id, 'Restore this independently reviewed group', 'integration-reviewer'],
    );
    assert.equal(unmerged.rows[0].result.action, 'unmerge');
    assert.equal((await client.query('SELECT public.skynet_event_root($1) AS root', [c.eventId])).rows[0].root, b.eventId,
      'Unmerging a subgroup retains its descendants');
    assert.equal((await client.query('SELECT public.skynet_event_root($1) AS root', [b.eventId])).rows[0].root, b.eventId);
    const afterUndo = await readDatabaseSnapshotFromClient(client);
    assert.equal(buildDatabaseDataset(afterUndo).incidents.length, 3);
    assert.equal(buildDatabaseDataset(afterUndo).totalPoints, 18);
    assert.equal(afterUndo.history.length, originalSnapshot.history.length);
    const postUndoPairs = await candidates(client);
    assert.equal(postUndoPairs.some((pair) => {
      const ids = [pair.left.event_id, pair.right.event_id];
      return ids.includes(a.eventId) && ids.includes(b.eventId);
    }), false, 'An unchanged manual unmerge is not proposed again');

    const adPair = findPair(await candidates(client), a.eventId, d.eventId);
    const queued = await decide(client, adPair, classification(adPair, 0.85), true);
    assert.equal(queued.action, 'review');
    const queue = await client.query<{ proposal_id: string; is_fresh: boolean }>(
      'SELECT proposal_id, is_fresh FROM public.event_duplicate_review_queue WHERE proposal_id = $1',
      [queued.decision_id],
    );
    assert.deepEqual(queue.rows, [{ proposal_id: queued.decision_id, is_fresh: true }]);
    const rejected = await client.query<{ result: Record<string, unknown> }>(
      'SELECT public.skynet_review_duplicate($1,false,$2,$3) AS result',
      [queued.decision_id, 'Different evaluation runs after manual review', 'integration-reviewer'],
    );
    assert.equal(rejected.rows[0].result.action, 'reject');
    const repeatedReview = await client.query<{ result: Record<string, unknown> }>(
      'SELECT public.skynet_review_duplicate($1,true,$2,$3) AS result',
      [queued.decision_id, 'A later attempt must remain idempotent', 'another-reviewer'],
    );
    assert.equal(repeatedReview.rows[0].result.action, 'reject');
    assert.equal(repeatedReview.rows[0].result.idempotent, true);

    const bdPair = findPair(await candidates(client), b.eventId, d.eventId);
    await client.query("UPDATE public.assessments SET scoring_notes = scoring_notes || ' Later source correction.' WHERE id = $1", [c.assessmentId]);
    const stale = await decide(client, bdPair);
    assert.equal(stale.action, 'stale', 'A change to a non-root group member invalidates the whole candidate');

    await assert.rejects(
      decide(client, { ...bdPair, right: { ...bdPair.right, event_id: '999999999' } }),
      /unknown event ID|fingerprint|stale/i,
    );
    await assert.rejects(
      decide(client, bdPair, { ...classification(bdPair), evidence_left: 'invented evidence that is definitely not in the candidate' }),
      /Evidence excerpts/,
    );
    await assert.rejects(
      decide(client, bdPair, { ...classification(bdPair), unexpected: true }),
      /exactly the documented fields/,
    );

    const i = await insertEvent(client, 'I', '2026-10-10');
    const j = await insertEvent(client, 'J', '2026-10-18');
    const ijPair = findPair(await candidates(client), i.eventId, j.eventId);
    const guarded = await decide(client, ijPair, classification(ijPair, 1));
    assert.equal(guarded.action, 'review', 'Even a perfect model score cannot auto-merge incidents eight days apart');

    const e = await insertEvent(client, 'E', '2026-10-05');
    const f = await insertEvent(client, 'F', '2026-10-06');
    const efPair = findPair(await candidates(client), e.eventId, f.eventId);
    const mergeClientA = await pool.connect();
    const mergeClientB = await pool.connect();
    try {
      const [first, second] = await Promise.all([
        decide(mergeClientA, efPair),
        decide(mergeClientB, efPair),
      ]);
      assert.equal(first.action, 'merge');
      assert.equal(second.action, 'merge');
      assert.equal(first.decision_id, second.decision_id, 'Concurrent classifiers resolve to one merge decision');
      assert.equal(Number((await client.query(
        'SELECT count(*) FROM public.event_parents WHERE child_event_id IN ($1,$2)',
        [e.eventId, f.eventId],
      )).rows[0].count), 1);
    } finally {
      mergeClientA.release();
      mergeClientB.release();
    }

    const g = await insertEvent(client, 'G', '2026-10-07');
    const h = await insertEvent(client, 'H', '2026-10-08');
    const ghPair = findPair(await candidates(client), g.eventId, h.eventId);
    const ghProposal = await decide(client, ghPair, classification(ghPair, 0.75, 'uncertain'));
    assert.equal(ghProposal.action, 'review');
    const reviewClientA = await pool.connect();
    const reviewClientB = await pool.connect();
    try {
      const review = (reviewClient: PoolClient, accept: boolean) => reviewClient.query<{ result: Record<string, unknown> }>(
        'SELECT public.skynet_review_duplicate($1,$2,$3,$4) AS result',
        [ghProposal.decision_id, accept, 'Concurrent reviewers must resolve once', accept ? 'reviewer-a' : 'reviewer-b'],
      ).then((result) => result.rows[0].result);
      const [first, second] = await Promise.all([review(reviewClientA, true), review(reviewClientB, false)]);
      assert.equal(first.decision_id, second.decision_id, 'Concurrent reviews append one resolution');
      assert.equal(first.action, second.action);
      assert.ok(['merge', 'reject'].includes(String(first.action)));
      assert.equal(Number((await client.query(
        'SELECT count(*) FROM public.event_identity_decisions WHERE proposal_id = $1',
        [ghProposal.decision_id],
      )).rows[0].count), 1);
    } finally {
      reviewClientA.release();
      reviewClientB.release();
    }

    await client.query('BEGIN');
    await client.query('SAVEPOINT decision_append_only');
    await assert.rejects(
      client.query("UPDATE public.event_identity_decisions SET rationale = 'changed' WHERE id = $1", [mergedBc.decision_id]),
      /append-only/,
    );
    await client.query('ROLLBACK TO SAVEPOINT decision_append_only');
    await client.query('COMMIT');

    const beforeHistory = Number((await client.query('SELECT count(*) FROM public.record_history')).rows[0].count);
    await client.query("UPDATE public.assessments SET scoring_notes = scoring_notes || ' Future ingestion remains live.' WHERE id = $1", [c.assessmentId]);
    const afterHistory = Number((await client.query('SELECT count(*) FROM public.record_history')).rows[0].count);
    assert.equal(afterHistory, beforeHistory + 1, 'Future updates to a grouped source retain their append-only history');
    assert.equal((await client.query('SELECT public.skynet_event_root($1) AS root', [c.eventId])).rows[0].root, b.eventId);
  } finally {
    client.release();
    await pool.end();
    await admin.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
    await admin.end();
  }
});

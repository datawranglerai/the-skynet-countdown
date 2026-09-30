import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import {
  HISTORICAL_MANIFEST,
  loadDataset,
  parseAssessmentRecord,
  parseCsv,
  parseEditorialRecord,
  type CsvRecord,
} from '../src/lib/index.ts';
import { assessmentPayloadToRecord, storyPayloadToRecord } from '../server/dataset.ts';
import { buildDatabaseDataset } from '../server/dataset.ts';
import { createPostgresPool, readDatabaseSnapshotFromClient } from '../server/postgres.ts';
import type { DatabaseSnapshot } from '../server/storage-types.ts';

export interface AssessmentImport {
  eventSlug: string;
  sourceUrl: string;
  contentFingerprint: string;
  versionKey: string;
  payload: Record<string, unknown>;
  csvRowNumbers: number[];
}

export interface StoryImport {
  eventSlug: string;
  assessmentSourceUrl: string;
  contentFingerprint: string;
  linkedAssessmentFingerprint: string;
  versionKey: string;
  payload: Record<string, unknown>;
  csvRowNumbers: number[];
}

export interface EventImport {
  slug: string;
  publicId: string;
  selectionRationale: string;
  selectedAssessmentFingerprint: string;
  selectedStoryFingerprint?: string;
}

export interface MigrationPlan {
  events: EventImport[];
  assessments: AssessmentImport[];
  stories: StoryImport[];
  expectedPoints: number;
  inspection?: MigrationInspection;
}

export interface MigrationInspection {
  existingAssessments: number;
  existingStories: number;
  missingSourceUrls: string[];
  assessmentConflicts: string[];
  rewrittenStoryIds: string[];
}

function assessmentPayload(row: CsvRecord): Record<string, unknown> {
  const parsed = parseAssessmentRecord(row).assessment;
  return {
    cve_id: parsed.cveId,
    incident_title: row.incident_title,
    incident_date: parsed.date,
    source_url: parsed.sourceUrl,
    classification: parsed.severity,
    total_score: parsed.score,
    clock_delta_minutes: parsed.legacyMinutes,
    full_trifecta: parsed.fullTrifecta,
    t1_score: parsed.scores.t1, t1_rationale: row.t1_rationale,
    t2_score: parsed.scores.t2, t2_rationale: row.t2_rationale,
    t3_score: parsed.scores.t3, t3_rationale: row.t3_rationale,
    amp_governance_vacuum_score: parsed.scores.governance,
    amp_governance_vacuum_rationale: row.amp_governance_vacuum_rationale,
    amp_autonomy_score: parsed.scores.autonomy,
    amp_autonomy_rationale: row.amp_autonomy_rationale,
    amp_capability_erosion_score: parsed.scores.erosion,
    amp_capability_erosion_rationale: row.amp_capability_erosion_rationale,
    amp_sentience_score: parsed.scores.sentience,
    amp_sentience_rationale: row.amp_sentience_rationale,
    amp_physical_score: parsed.scores.physical,
    amp_physical_rationale: row.amp_physical_rationale,
    is_leading_indicator: parsed.leadingIndicator,
    leading_indicator_note: row.leading_indicator_note,
    scoring_notes: row.scoring_notes,
  };
}

function storyPayload(row: CsvRecord): Record<string, unknown> {
  const parsed = parseEditorialRecord(row).editorial;
  return {
    cve_id: parsed.cveId,
    headline: row.headline,
    severity_label: parsed.severity,
    clock_delta_label: parsed.legacyDeltaLabel,
    metadata_line: row.metadata_line,
    the_story: row.the_story,
    our_take: row.our_take,
    updated_clock_position: parsed.legacyClockPosition,
  };
}

export function buildMigrationPlan(assessmentCsv: string, storyCsv: string): MigrationPlan {
  const dataset = loadDataset(assessmentCsv, storyCsv);
  if (dataset.diagnostics.length > 0) {
    throw new Error(`CSV audit failed:\n${dataset.diagnostics.join('\n')}`);
  }
  const rawAssessments = parseCsv(assessmentCsv).map((row, index) => ({ row, parsed: parseAssessmentRecord(row, index) }));
  const groupedAssessments = new Map<string, { row: CsvRecord; parsed: ReturnType<typeof parseAssessmentRecord>; csvRowNumbers: number[] }>();
  for (const [index, value] of rawAssessments.entries()) {
    const existing = groupedAssessments.get(value.parsed.contentFingerprint);
    if (existing) existing.csvRowNumbers.push(index + 1);
    else groupedAssessments.set(value.parsed.contentFingerprint, { ...value, csvRowNumbers: [index + 1] });
  }
  const distinctAssessments = [...groupedAssessments.values()];
  const assessmentEvent = new Map<string, string>();
  for (const event of HISTORICAL_MANIFEST) {
    for (const fingerprint of event.assessmentContentFingerprints) assessmentEvent.set(fingerprint, event.id);
  }
  const assessments: AssessmentImport[] = distinctAssessments.map(({ row, parsed, csvRowNumbers }) => {
    const eventSlug = assessmentEvent.get(parsed.contentFingerprint);
    if (!eventSlug) throw new Error(`Assessment ${parsed.contentFingerprint} is not assigned to an audited event`);
    return {
      eventSlug,
      sourceUrl: parsed.assessment.sourceUrl,
      contentFingerprint: parsed.contentFingerprint,
      versionKey: `csv-assessment:${parsed.contentFingerprint}`,
      payload: assessmentPayload(row),
      csvRowNumbers,
    };
  });
  const assessmentByContent = new Map(assessments.map((value) => [value.contentFingerprint, value]));

  const rawStories = parseCsv(storyCsv).map((row, index) => ({ row, parsed: parseEditorialRecord(row, index) }));
  const storyLinks = new Map(HISTORICAL_MANIFEST.flatMap((event) => event.storyLinks.map((link) => [
    link.storyContentFingerprint, { event, link },
  ] as const)));
  const stories: StoryImport[] = rawStories.map(({ row, parsed }, index) => {
    const resolved = storyLinks.get(parsed.contentFingerprint);
    if (!resolved) throw new Error(`Story ${parsed.contentFingerprint} is not assigned to an audited event`);
    const assessment = assessmentByContent.get(resolved.link.assessmentContentFingerprint);
    if (!assessment) throw new Error(`Story ${parsed.contentFingerprint} links an unknown assessment version`);
    return {
      eventSlug: resolved.event.id,
      assessmentSourceUrl: assessment.sourceUrl,
      contentFingerprint: parsed.contentFingerprint,
      linkedAssessmentFingerprint: assessment.contentFingerprint,
      versionKey: `csv-story:${parsed.contentFingerprint}`,
      payload: storyPayload(row),
      csvRowNumbers: [index + 1],
    };
  });

  const incidents = new Map(dataset.incidents.map((incident) => [incident.id, incident]));
  const ordered = [...HISTORICAL_MANIFEST].sort((left, right) => {
    const a = incidents.get(left.id)?.assessment.date ?? '';
    const b = incidents.get(right.id)?.assessment.date ?? '';
    return a.localeCompare(b) || left.id.localeCompare(right.id);
  });
  const years = new Map<string, number>();
  const events: EventImport[] = ordered.map((manifest) => {
    const incident = incidents.get(manifest.id);
    if (!incident) throw new Error(`Audited event ${manifest.id} is missing from the dataset`);
    const year = incident.assessment.date.slice(0, 4);
    const sequence = (years.get(year) ?? 0) + 1;
    years.set(year, sequence);
    const matchingStories = manifest.storyLinks.filter(
      (link) => link.assessmentContentFingerprint === manifest.selectedAssessmentContentFingerprint,
    );
    const selectedLink = manifest.storyLinks.find((link) => link.preferred)
      ?? matchingStories[0]
      ?? manifest.storyLinks[0];
    return {
      slug: manifest.id,
      publicId: `SKYNET-${year}-${String(sequence).padStart(4, '0')}`,
      selectionRationale: manifest.selectionRationale,
      selectedAssessmentFingerprint: manifest.selectedAssessmentContentFingerprint,
      selectedStoryFingerprint: selectedLink?.storyContentFingerprint,
    };
  });
  return { events, assessments, stories, expectedPoints: dataset.totalPoints };
}

const ASSESSMENT_COLUMNS = [
  'cve_id', 'incident_title', 'incident_date', 'source_url', 'classification', 'total_score',
  'clock_delta_minutes', 'full_trifecta', 't1_score', 't1_rationale', 't2_score', 't2_rationale',
  't3_score', 't3_rationale', 'amp_governance_vacuum_score', 'amp_governance_vacuum_rationale',
  'amp_autonomy_score', 'amp_autonomy_rationale', 'amp_capability_erosion_score',
  'amp_capability_erosion_rationale', 'amp_sentience_score', 'amp_sentience_rationale',
  'amp_physical_score', 'amp_physical_rationale', 'is_leading_indicator', 'leading_indicator_note',
  'scoring_notes',
] as const;
const STORY_COLUMNS = [
  'cve_id', 'headline', 'severity_label', 'clock_delta_label', 'metadata_line', 'the_story',
  'our_take', 'updated_clock_position',
] as const;

function values(payload: Record<string, unknown>, columns: readonly string[]): unknown[] {
  return columns.map((column) => payload[column]);
}

interface StoredAssessment {
  id: string;
  event_id: string | null;
  source_url: string;
  [key: string]: unknown;
}

interface StoredStory {
  id: string;
  assessment_id: string;
  [key: string]: unknown;
}

export async function inspectMigrationDatabase(client: PoolClient, plan: MigrationPlan): Promise<MigrationInspection> {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query(`SET LOCAL statement_timeout = '15s'`);
    const assessments = await client.query<StoredAssessment>('SELECT * FROM public.assessments ORDER BY id');
    const stories = await client.query<StoredStory>('SELECT * FROM public.stories ORDER BY id');
    const plannedBySource = new Map<string, Set<string>>();
    for (const planned of plan.assessments) {
      const values = plannedBySource.get(planned.sourceUrl) ?? new Set<string>();
      values.add(planned.contentFingerprint);
      plannedBySource.set(planned.sourceUrl, values);
    }
    const existingSources = new Set(assessments.rows.map((row) => row.source_url));
    const assessmentConflicts: string[] = [];
    const sourceByAssessmentId = new Map<string, string>();
    for (const row of assessments.rows) {
      sourceByAssessmentId.set(String(row.id), row.source_url);
      const fingerprint = parseAssessmentRecord(
        assessmentPayloadToRecord(row), 0, { validateCveFormat: false },
      ).contentFingerprint;
      if (!plannedBySource.get(row.source_url)?.has(fingerprint)) assessmentConflicts.push(row.source_url);
    }
    const rewrittenStoryIds: string[] = [];
    for (const row of stories.rows) {
      const sourceUrl = sourceByAssessmentId.get(String(row.assessment_id));
      const fingerprint = parseEditorialRecord(
        storyPayloadToRecord(row), 0, { validateCveFormat: false },
      ).contentFingerprint;
      if (!sourceUrl || !plan.stories.some((story) =>
        story.assessmentSourceUrl === sourceUrl && story.contentFingerprint === fingerprint)) {
        rewrittenStoryIds.push(String(row.id));
      }
    }
    await client.query('COMMIT');
    return {
      existingAssessments: assessments.rowCount ?? assessments.rows.length,
      existingStories: stories.rowCount ?? stories.rows.length,
      missingSourceUrls: [...plannedBySource.keys()].filter((url) => !existingSources.has(url)).sort(),
      assessmentConflicts: assessmentConflicts.sort(),
      rewrittenStoryIds,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function assessmentVersions(client: PoolClient): Promise<Map<string, { key: string; sourceId: string; eventId: string }>> {
  const rows = await client.query<{ version_key: string; source_row_id: string; event_id: string; payload: Record<string, unknown> }>(
    `SELECT version_key, source_row_id, event_id, payload FROM public.record_history WHERE kind = 'assessment'`,
  );
  return new Map(rows.rows.map((row) => {
    const parsed = parseAssessmentRecord(assessmentPayloadToRecord(row.payload), 0, { validateCveFormat: false });
    return [parsed.contentFingerprint, { key: row.version_key, sourceId: String(row.source_row_id), eventId: String(row.event_id) }];
  }));
}

async function storyVersions(client: PoolClient): Promise<Map<string, { key: string; sourceId: string; eventId: string; assessmentFingerprint: string }>> {
  const rows = await client.query<{ version_key: string; source_row_id: string; event_id: string; payload: Record<string, unknown>; assessment_payload: Record<string, unknown> }>(
    `SELECT s.version_key, s.source_row_id, s.event_id, s.payload, a.payload AS assessment_payload
       FROM public.record_history s JOIN public.record_history a ON a.version_key = s.assessment_version_key
      WHERE s.kind = 'story' AND a.kind = 'assessment' ORDER BY s.id`,
  );
  return new Map(rows.rows.map((row) => {
    const parsed = parseEditorialRecord(storyPayloadToRecord(row.payload), 0, { validateCveFormat: false });
    const assessment = parseAssessmentRecord(assessmentPayloadToRecord(row.assessment_payload), 0, { validateCveFormat: false });
    return [parsed.contentFingerprint, { key: row.version_key, sourceId: String(row.source_row_id), eventId: String(row.event_id), assessmentFingerprint: assessment.contentFingerprint }];
  }));
}

function assertImportCoverage(snapshot: DatabaseSnapshot, plan: MigrationPlan): void {
  const assessmentHistory = snapshot.history.filter((row) => row.kind === 'assessment');
  const fingerprints = new Map(assessmentHistory.map((row) => [
    row.version_key, parseAssessmentRecord(assessmentPayloadToRecord(row.payload), 0, { validateCveFormat: false }).contentFingerprint,
  ]));
  for (const planned of plan.assessments) {
    if (!assessmentHistory.some((row) => fingerprints.get(row.version_key) === planned.contentFingerprint)) {
      throw new Error(`Missing imported assessment ${planned.contentFingerprint}`);
    }
  }
  const storyHistory = snapshot.history.filter((row) => row.kind === 'story');
  for (const planned of plan.stories) {
    if (!storyHistory.some((row) =>
      parseEditorialRecord(storyPayloadToRecord(row.payload), 0, { validateCveFormat: false }).contentFingerprint === planned.contentFingerprint
      && fingerprints.get(row.assessment_version_key ?? '') === planned.linkedAssessmentFingerprint)) {
      throw new Error(`Missing exact assessment link for imported story ${planned.contentFingerprint}`);
    }
  }
  for (const kind of ['assessment', 'story'] as const) {
    const imported = snapshot.history.filter((row) => row.kind === kind).flatMap((row) => {
      const numbers = row.provenance_details.csv_row_numbers;
      return Array.isArray(numbers) ? numbers as number[] : [];
    }).sort((a, b) => a - b);
    const expected = (kind === 'assessment' ? plan.assessments : plan.stories)
      .flatMap((row) => row.csvRowNumbers).sort((a, b) => a - b);
    if (JSON.stringify(imported) !== JSON.stringify(expected)) throw new Error(`Incomplete ${kind} CSV row provenance`);
  }
}

export async function applyMigrationPlan(
  client: PoolClient,
  plan: MigrationPlan,
  options: { schemaSql?: string } = {},
): Promise<void> {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  try {
    await client.query(`SET LOCAL statement_timeout = '15s'`);
    await client.query(`SELECT pg_advisory_xact_lock(194299, 0)`);
    if (options.schemaSql) await client.query(options.schemaSql);
    await client.query('LOCK TABLE public.assessments, public.stories IN SHARE ROW EXCLUSIVE MODE');

    const completed = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM public.events WHERE slug = ANY($1::text[]) AND bootstrap_completed_at IS NOT NULL',
      [plan.events.map((event) => event.slug)],
    );
    if (completed.rows[0].count === plan.events.length) {
      const snapshot = await readDatabaseSnapshotFromClient(client);
      assertImportCoverage(snapshot, plan);
      const current = buildDatabaseDataset(snapshot);
      if (current.diagnostics.length) throw new Error(`Dataset diagnostics: ${current.diagnostics.join('; ')}`);
      await client.query('COMMIT');
      return;
    }

    for (const event of plan.events) {
      await client.query(
        `INSERT INTO public.events (slug, public_id, selection_rationale)
         VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING`,
        [event.slug, event.publicId, event.selectionRationale],
      );
      const existing = await client.query<{ public_id: string }>('SELECT public_id FROM public.events WHERE slug = $1', [event.slug]);
      if (existing.rows[0]?.public_id !== event.publicId) {
        throw new Error(`Event ${event.slug} already exists with a different public ID`);
      }
      await client.query(
        `UPDATE public.events SET selection_rationale = $2
          WHERE slug = $1 AND selection_rationale IS DISTINCT FROM $2`,
        [event.slug, event.selectionRationale],
      );
    }

    const eventRows = await client.query<{ id: string; slug: string }>('SELECT id, slug FROM public.events');
    const eventIds = new Map(eventRows.rows.map((row) => [row.slug, String(row.id)]));
    const currentAssessments = await client.query<StoredAssessment>('SELECT * FROM public.assessments ORDER BY id');
    const assessmentBySource = new Map(currentAssessments.rows.map((row) => [row.source_url, row]));
    const latestAssessmentBySource = new Map<string, AssessmentImport>();
    for (const planned of plan.assessments) latestAssessmentBySource.set(planned.sourceUrl, planned);

    for (const [sourceUrl, planned] of latestAssessmentBySource) {
      const eventId = eventIds.get(planned.eventSlug);
      if (!eventId) throw new Error(`Event ${planned.eventSlug} was not created`);
      const existing = assessmentBySource.get(sourceUrl);
      const existingFingerprint = existing
        ? parseAssessmentRecord(assessmentPayloadToRecord(existing), 0, { validateCveFormat: false }).contentFingerprint
        : undefined;
      const provenanceVersion = existingFingerprint
        ? plan.assessments.find((version) => version.contentFingerprint === existingFingerprint)
        : planned;
      await client.query(`SELECT set_config('skynet.provenance_details', $1, true)`, [
        JSON.stringify({ csv_row_numbers: provenanceVersion?.csvRowNumbers ?? [] }),
      ]);
      if (existing) {
        await client.query(
          'UPDATE public.assessments SET event_id = $2 WHERE id = $1 AND event_id IS DISTINCT FROM $2',
          [existing.id, eventId],
        );
        existing.event_id = eventId;
      } else {
        const placeholders = ASSESSMENT_COLUMNS.map((_, index) => `$${index + 1}`).join(', ');
        const inserted = await client.query<StoredAssessment>(
          `INSERT INTO public.assessments (${ASSESSMENT_COLUMNS.join(', ')}, event_id)
           VALUES (${placeholders}, $${ASSESSMENT_COLUMNS.length + 1}) RETURNING *`,
          [...values(planned.payload, ASSESSMENT_COLUMNS), eventId],
        );
        assessmentBySource.set(sourceUrl, inserted.rows[0]);
      }
      await client.query(`SELECT set_config('skynet.provenance_details', '{}', true)`);
    }

    let knownAssessments = await assessmentVersions(client);
    for (const planned of plan.assessments) {
      if (knownAssessments.has(planned.contentFingerprint)) continue;
      const source = assessmentBySource.get(planned.sourceUrl);
      const eventId = eventIds.get(planned.eventSlug);
      if (!source || !eventId) throw new Error(`Cannot import assessment version ${planned.versionKey}`);
      await client.query(
        `INSERT INTO public.record_history
          (kind, source_row_id, event_id, version_key, payload, provenance, provenance_details, import_key)
         VALUES ('assessment', $1, $2, $3, $4::jsonb, 'csv-migration', $5::jsonb, $3)
         ON CONFLICT (import_key) DO NOTHING`,
        [source.id, eventId, planned.versionKey, JSON.stringify(planned.payload), JSON.stringify({ csv_row_numbers: planned.csvRowNumbers })],
      );
    }
    knownAssessments = await assessmentVersions(client);

    for (const event of plan.events) {
      const selected = knownAssessments.get(event.selectedAssessmentFingerprint);
      const eventId = eventIds.get(event.slug);
      if (!selected || selected.eventId !== eventId) throw new Error(`Cannot select assessment for ${event.slug}`);
      await client.query(
        `UPDATE public.events SET selected_assessment_id = $2, selected_assessment_version_key = $3
          WHERE id = $1 AND bootstrap_completed_at IS NULL`,
        [eventId, selected.sourceId, selected.key],
      );
    }

    const currentStories = await client.query<StoredStory>('SELECT * FROM public.stories ORDER BY id');
    const originalStoryIds = new Set(currentStories.rows.map((row) => String(row.id)));
    const storyByAssessment = new Map(currentStories.rows.map((row) => [String(row.assessment_id), row]));
    const assessmentById = new Map([...assessmentBySource.values()].map((row) => [String(row.id), row]));
    for (const story of currentStories.rows) {
      const assessment = assessmentById.get(String(story.assessment_id));
      if (!assessment) throw new Error(`Existing story ${story.id} has no assessment`);
      const currentVersion = await client.query<{ version_key: string }>(
        `SELECT version_key FROM public.record_history
          WHERE kind = 'assessment' AND source_row_id = $1 AND provenance = 'n8n'
          ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [assessment.id],
      );
      const linkedKey = currentVersion.rows[0]?.version_key;
      if (!linkedKey || !assessment.event_id) throw new Error(`Existing story ${story.id} cannot link to its current assessment`);
      await client.query(
        `UPDATE public.stories SET event_id = $2, assessment_version_key = $3
          WHERE id = $1 AND (event_id IS DISTINCT FROM $2 OR assessment_version_key IS DISTINCT FROM $3)`,
        [story.id, assessment.event_id, linkedKey],
      );
    }
    const latestStoryBySource = new Map<string, StoryImport>();
    for (const planned of plan.stories) latestStoryBySource.set(planned.assessmentSourceUrl, planned);
    for (const [sourceUrl, planned] of latestStoryBySource) {
      const assessment = assessmentBySource.get(sourceUrl);
      if (!assessment) throw new Error(`Story source ${sourceUrl} has no assessment row`);
      if (!storyByAssessment.has(String(assessment.id))) {
        const linkedAssessment = knownAssessments.get(planned.linkedAssessmentFingerprint);
        if (!linkedAssessment) throw new Error(`Missing assessed version for ${planned.versionKey}`);
        await client.query(`SELECT set_config('skynet.provenance_details', $1, true)`, [
          JSON.stringify({ csv_row_numbers: planned.csvRowNumbers }),
        ]);
        const inserted = await client.query<StoredStory>(
          `INSERT INTO public.stories (assessment_id, assessment_version_key, ${STORY_COLUMNS.join(', ')})
           VALUES ($1, $2, ${STORY_COLUMNS.map((_, index) => `$${index + 3}`).join(', ')}) RETURNING *`,
          [assessment.id, linkedAssessment.key, ...values(planned.payload, STORY_COLUMNS)],
        );
        storyByAssessment.set(String(assessment.id), inserted.rows[0]);
        await client.query(`SELECT set_config('skynet.provenance_details', '{}', true)`);
      }
    }

    let knownStories = await storyVersions(client);
    for (const planned of plan.stories) {
      if (knownStories.get(planned.contentFingerprint)?.assessmentFingerprint === planned.linkedAssessmentFingerprint) continue;
      const assessment = assessmentBySource.get(planned.assessmentSourceUrl);
      const story = assessment ? storyByAssessment.get(String(assessment.id)) : undefined;
      const eventId = eventIds.get(planned.eventSlug);
      const linkedAssessment = knownAssessments.get(planned.linkedAssessmentFingerprint);
      if (!story || !eventId || !linkedAssessment) throw new Error(`Cannot import story version ${planned.versionKey}`);
      await client.query(
        `INSERT INTO public.record_history
          (kind, source_row_id, event_id, version_key, assessment_version_key, payload, provenance, provenance_details, import_key)
         VALUES ('story', $1, $2, $3, $4, $5::jsonb, 'csv-migration', $6::jsonb, $3)
         ON CONFLICT (import_key) DO NOTHING`,
        [story.id, eventId, planned.versionKey, linkedAssessment.key, JSON.stringify(planned.payload), JSON.stringify({ csv_row_numbers: planned.csvRowNumbers })],
      );
    }
    knownStories = await storyVersions(client);
    for (const event of plan.events) {
      if (!event.selectedStoryFingerprint) continue;
      const plannedSelection = plan.stories.find((story) => story.contentFingerprint === event.selectedStoryFingerprint);
      const selectedAssessment = plannedSelection ? assessmentBySource.get(plannedSelection.assessmentSourceUrl) : undefined;
      const selectedStory = selectedAssessment ? storyByAssessment.get(String(selectedAssessment.id)) : undefined;
      const currentStoryFingerprint = selectedStory
        ? parseEditorialRecord(storyPayloadToRecord(selectedStory), 0, { validateCveFormat: false }).contentFingerprint
        : undefined;
      const currentSelected = selectedStory && originalStoryIds.has(String(selectedStory.id)) && currentStoryFingerprint
        ? knownStories.get(currentStoryFingerprint) : undefined;
      const selected = currentSelected ?? knownStories.get(event.selectedStoryFingerprint);
      const eventId = eventIds.get(event.slug);
      if (!selected || selected.eventId !== eventId) throw new Error(`Cannot select story for ${event.slug}`);
      await client.query(
        `UPDATE public.events SET selected_story_id = $2, selected_story_version_key = $3
          WHERE id = $1 AND bootstrap_completed_at IS NULL`,
        [eventId, selected.sourceId, selected.key],
      );
    }
    await client.query(
      `UPDATE public.events SET bootstrap_completed_at = clock_timestamp()
        WHERE bootstrap_completed_at IS NULL AND slug = ANY($1::text[])`,
      [plan.events.map((event) => event.slug)],
    );

    const checks = await client.query<{
      event_count: number; unattached_assessments: number; unlinked_stories: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.events) AS event_count,
        (SELECT count(*)::int FROM public.assessments WHERE event_id IS NULL) AS unattached_assessments,
        (SELECT count(*)::int FROM public.stories WHERE event_id IS NULL OR assessment_version_key IS NULL) AS unlinked_stories
    `);
    const check = checks.rows[0];
    if (!check || check.event_count < plan.events.length || check.unattached_assessments || check.unlinked_stories) {
      throw new Error(`Migration invariant failed: ${JSON.stringify(check)}`);
    }
    const snapshot = await readDatabaseSnapshotFromClient(client);
    assertImportCoverage(snapshot, plan);
    const dataset = buildDatabaseDataset(snapshot);
    if (dataset.incidents.length !== plan.events.length || dataset.totalPoints !== plan.expectedPoints) {
      throw new Error(`Dataset parity failed: ${dataset.incidents.length} events / ${dataset.totalPoints} points`);
    }
    if (dataset.diagnostics.length > 0) throw new Error(`Dataset diagnostics: ${dataset.diagnostics.join('; ')}`);
    const finalAssessments = await assessmentVersions(client);
    const finalStories = await storyVersions(client);
    for (const planned of plan.assessments) {
      if (!finalAssessments.has(planned.contentFingerprint)) throw new Error(`Missing assessment history ${planned.versionKey}`);
    }
    for (const planned of plan.stories) {
      if (!finalStories.has(planned.contentFingerprint)) throw new Error(`Missing story history ${planned.versionKey}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function migratePostgres(
  connectionString: string,
  options: { apply?: boolean; assessmentCsv?: string; storyCsv?: string } = {},
): Promise<MigrationPlan> {
  const assessmentCsv = options.assessmentCsv ?? await readFile(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url), 'utf8');
  const storyCsv = options.storyCsv ?? await readFile(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url), 'utf8');
  const plan = buildMigrationPlan(assessmentCsv, storyCsv);
  const pool = createPostgresPool(connectionString);
  try {
    if (!options.apply) {
      const client = await pool.connect();
      try {
        plan.inspection = await inspectMigrationDatabase(client, plan);
      } finally {
        client.release();
      }
      return plan;
    }
    const schema = await readFile(new URL('../db/001_events_and_history.sql', import.meta.url), 'utf8');
    const client = await pool.connect();
    try {
      await applyMigrationPlan(client, plan, { schemaSql: schema });
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  return plan;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const offline = process.argv.includes('--offline');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !offline) throw new Error('DATABASE_URL is required (or use --offline for a CSV-only plan)');
  const plan = offline
    ? buildMigrationPlan(
      await readFile(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url), 'utf8'),
      await readFile(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url), 'utf8'),
    )
    : await migratePostgres(connectionString!, { apply });
  console.log(`${apply ? 'Applied' : 'Dry run'}: ${plan.events.length} events, ${plan.assessments.length} assessment versions, ${plan.stories.length} story versions, ${plan.expectedPoints} points.`);
  if (plan.inspection) {
    console.log(`${plan.inspection.existingAssessments} existing assessments · ${plan.inspection.existingStories} existing stories · ${plan.inspection.missingSourceUrls.length} source URLs to insert · ${plan.inspection.rewrittenStoryIds.length} rewritten stories to preserve.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}

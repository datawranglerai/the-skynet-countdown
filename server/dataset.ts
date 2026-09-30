import {
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
} from '../src/lib/calibration.ts';
import { type CsvRecord } from '../src/lib/csv.ts';
import {
  ASSESSMENT_HEADERS,
  STORY_HEADERS,
  parseAssessmentRecord,
  parseEditorialRecord,
} from '../src/lib/records.ts';
import { calculateRiskScore } from '../src/lib/scoring.ts';
import type {
  Assessment,
  Dataset,
  Editorial,
  Incident,
} from '../src/lib/types.ts';
import type { DatabaseHistoryRow, DatabaseSnapshot } from './storage-types.ts';

function csvBoolean(value: unknown): string {
  return value === true || value === 'TRUE' ? 'TRUE' : 'FALSE';
}

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function assessmentPayloadToRecord(payload: Record<string, unknown>): CsvRecord {
  return {
    cve_id: text(payload.cve_id),
    incident_title: text(payload.incident_title),
    incident_date: text(payload.incident_date).slice(0, 10),
    source_url: text(payload.source_url),
    classification: text(payload.classification),
    total_score: text(payload.total_score),
    clock_delta_minutes: text(payload.clock_delta_minutes),
    full_trifecta: csvBoolean(payload.full_trifecta),
    t1_score: text(payload.t1_score),
    t1_rationale: text(payload.t1_rationale),
    t2_score: text(payload.t2_score),
    t2_rationale: text(payload.t2_rationale),
    t3_score: text(payload.t3_score),
    t3_rationale: text(payload.t3_rationale),
    amp_governance_vacuum_score: text(payload.amp_governance_vacuum_score),
    amp_governance_vacuum_rationale: text(payload.amp_governance_vacuum_rationale),
    amp_autonomy_score: text(payload.amp_autonomy_score),
    amp_autonomy_rationale: text(payload.amp_autonomy_rationale),
    amp_capability_erosion_score: text(payload.amp_capability_erosion_score),
    amp_capability_erosion_rationale: text(payload.amp_capability_erosion_rationale),
    amp_sentience_score: text(payload.amp_sentience_score),
    amp_sentience_rationale: text(payload.amp_sentience_rationale),
    amp_physical_score: text(payload.amp_physical_score),
    amp_physical_rationale: text(payload.amp_physical_rationale),
    is_leading_indicator: csvBoolean(payload.is_leading_indicator),
    leading_indicator_note: text(payload.leading_indicator_note),
    scoring_notes: text(payload.scoring_notes),
  };
}

export function storyPayloadToRecord(payload: Record<string, unknown>): CsvRecord {
  return {
    cve_id: text(payload.cve_id),
    headline: text(payload.headline),
    severity_label: text(payload.severity_label),
    clock_delta_label: text(payload.clock_delta_label),
    metadata_line: text(payload.metadata_line),
    the_story: text(payload.the_story),
    our_take: text(payload.our_take),
    updated_clock_position: text(payload.updated_clock_position),
  };
}

function parseAssessmentHistory(row: DatabaseHistoryRow): Assessment {
  const parsed = parseAssessmentRecord(assessmentPayloadToRecord(row.payload), 0, { validateCveFormat: false });
  return { ...parsed.assessment, versionId: row.version_key };
}

function parseEditorialHistory(row: DatabaseHistoryRow): Editorial {
  const parsed = parseEditorialRecord(storyPayloadToRecord(row.payload), 0, { validateCveFormat: false });
  return { ...parsed.editorial, versionId: row.version_key };
}

function requireUnique<T>(values: readonly T[], description: string): T {
  if (values.length !== 1) throw new Error(`${description}: expected exactly one, found ${values.length}`);
  return values[0];
}

export function buildDatabaseDataset(
  snapshot: DatabaseSnapshot,
  generatedAt = snapshot.dataUpdatedAt,
): Dataset {
  const historiesByEvent = new Map<string, DatabaseHistoryRow[]>();
  for (const row of snapshot.history) {
    const values = historiesByEvent.get(row.event_id) ?? [];
    values.push(row);
    historiesByEvent.set(row.event_id, values);
  }

  const diagnostics: string[] = [];
  const chronological = snapshot.events.map((event) => {
    const history = historiesByEvent.get(event.id) ?? [];
    const assessmentRows = history.filter((row) => row.kind === 'assessment');
    const storyRows = history.filter((row) => row.kind === 'story');
    const selectedAssessmentRow = requireUnique(
      assessmentRows.filter((row) => row.version_key === event.selected_assessment_version_key),
      `Event ${event.slug} selected assessment`,
    );
    const assessment = parseAssessmentHistory(selectedAssessmentRow);
    const assessments = assessmentRows.map(parseAssessmentHistory)
      .sort((left, right) => left.date.localeCompare(right.date) || (left.versionId ?? '').localeCompare(right.versionId ?? ''));
    const editorials = storyRows.map(parseEditorialHistory)
      .sort((left, right) => (left.versionId ?? '').localeCompare(right.versionId ?? ''));
    const selectedStoryRow = event.selected_story_version_key
      ? requireUnique(
        storyRows.filter((row) => row.version_key === event.selected_story_version_key),
        `Event ${event.slug} selected story`,
      )
      : undefined;
    const editorial = selectedStoryRow ? parseEditorialHistory(selectedStoryRow) : undefined;
    const linkedAssessment = selectedStoryRow?.assessment_version_key
      ? assessmentRows.find((row) => row.version_key === selectedStoryRow.assessment_version_key)
      : undefined;
    if (selectedStoryRow && !linkedAssessment) {
      diagnostics.push(`Event ${event.slug} selected story has no linked assessment version.`);
    }
    return { event, assessment, assessments, editorial, editorials, linkedAssessment };
  }).sort((left, right) =>
    left.assessment.date.localeCompare(right.assessment.date) || left.event.slug.localeCompare(right.event.slug));

  let cumulativePoints = 0;
  const incidents: Incident[] = chronological.map((value) => {
    const scoring = calculateRiskScore(value.assessment.scores);
    const priorPoints = cumulativePoints;
    cumulativePoints += scoring.totalPoints;
    if (!Number.isSafeInteger(cumulativePoints)) throw new RangeError('Cumulative evidence points exceed safe integer range');
    const clock = calculateClock(cumulativePoints);
    return {
      id: value.event.slug,
      publicId: value.event.public_id,
      eventKey: value.event.id,
      assessment: value.assessment,
      assessments: value.assessments,
      editorial: value.editorial,
      editorials: value.editorials,
      editorialMatchesAssessment: value.linkedAssessment?.version_key === value.event.selected_assessment_version_key,
      editorialAssessmentScore: value.linkedAssessment
        ? calculateRiskScore(parseAssessmentHistory(value.linkedAssessment).scores).totalPoints
        : undefined,
      headline: value.editorial?.headline ?? value.assessment.title,
      selectionRationale: value.event.selection_rationale,
      scoring,
      effectivePoints: scoring.totalPoints,
      gapClosedPercent: calculateGapClosedPercent(scoring.totalPoints),
      cumulativePoints,
      remainingSeconds: clock.remainingSeconds,
      movementSeconds: calculateMovementSeconds(priorPoints, scoring.totalPoints),
    };
  });
  const clock = calculateClock(cumulativePoints);
  return {
    source: 'postgresql',
    generatedAt,
    dataUpdatedAt: snapshot.dataUpdatedAt,
    incidents,
    assessmentCount: snapshot.history.filter((row) => row.kind === 'assessment').length,
    editorialCount: snapshot.history.filter((row) => row.kind === 'story').length,
    duplicateCount: Math.max(0, snapshot.history.filter((row) => row.kind === 'assessment').length - incidents.length),
    matchedEditorialCount: incidents.reduce((sum, incident) => sum + incident.editorials.length, 0),
    diagnostics,
    totalPoints: cumulativePoints,
    remainingSeconds: clock.remainingSeconds,
    pressure: clock.pressure,
    lastUpdated: incidents.reduce((latest, incident) => incident.assessment.date > latest ? incident.assessment.date : latest, ''),
  };
}

function encodeCsv(headers: readonly string[], rows: readonly CsvRecord[]): string {
  const encode = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => encode(row[header] ?? '')).join(',')).join('\n')}\n`;
}

export function exportDatabaseCsv(snapshot: DatabaseSnapshot, kind: 'assessments' | 'stories'): string {
  const publicIds = new Map(snapshot.events.map((event) => [event.id, event.public_id]));
  const metadataHeaders = ['event_id', 'public_id', 'source_row_id', 'version_id', 'provenance', 'csv_row_numbers', 'recorded_at'];
  const metadata = (row: DatabaseHistoryRow) => ({
    event_id: row.event_id,
    public_id: publicIds.get(row.event_id) ?? '',
    source_row_id: row.source_row_id,
    version_id: row.version_key,
    provenance: row.provenance,
    csv_row_numbers: JSON.stringify(row.provenance_details.csv_row_numbers ?? []),
    recorded_at: row.recorded_at,
  });
  if (kind === 'assessments') {
    const headers = [...ASSESSMENT_HEADERS, ...metadataHeaders];
    const rows = snapshot.history.filter((row) => row.kind === 'assessment').map((row) => ({
      ...assessmentPayloadToRecord(row.payload), ...metadata(row),
    }));
    return encodeCsv(headers, rows);
  }
  const headers = [...STORY_HEADERS, ...metadataHeaders, 'assessment_version_id'];
  const rows = snapshot.history.filter((row) => row.kind === 'story').map((row) => ({
    ...storyPayloadToRecord(row.payload),
    ...metadata(row),
    assessment_version_id: row.assessment_version_key ?? '',
  }));
  return encodeCsv(headers, rows);
}

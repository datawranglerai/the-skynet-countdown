import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface TransactionPool {
  connect(): Promise<PoolClient>;
}

export interface DatabaseAssessmentRow {
  id: string;
  event_id: string;
  cve_id: string;
  incident_title: string;
  incident_date: string;
  source_url: string;
  classification: string;
  total_score: number;
  clock_delta_minutes: number;
  full_trifecta: boolean;
  t1_score: number;
  t1_rationale: string;
  t2_score: number;
  t2_rationale: string;
  t3_score: number;
  t3_rationale: string;
  amp_governance_vacuum_score: number;
  amp_governance_vacuum_rationale: string;
  amp_autonomy_score: number;
  amp_autonomy_rationale: string;
  amp_capability_erosion_score: number;
  amp_capability_erosion_rationale: string;
  amp_sentience_score: number;
  amp_sentience_rationale: string;
  amp_physical_score: number;
  amp_physical_rationale: string;
  is_leading_indicator: boolean;
  leading_indicator_note: string;
  scoring_notes: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseStoryRow {
  id: string;
  assessment_id: string;
  assessment_version_key: string;
  event_id: string;
  cve_id: string;
  headline: string;
  severity_label: string;
  clock_delta_label: string;
  metadata_line: string;
  the_story: string;
  our_take: string;
  updated_clock_position: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseEventRow {
  id: string;
  slug: string;
  public_id: string;
  selected_assessment_id: string;
  selected_assessment_version_key: string;
  selected_story_id: string | null;
  selected_story_version_key: string | null;
  selection_rationale: string;
  bootstrap_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RecordHistoryKind = 'assessment' | 'story';

export interface DatabaseHistoryRow {
  id: string;
  kind: RecordHistoryKind;
  source_row_id: string;
  event_id: string;
  version_key: string;
  assessment_version_key: string | null;
  payload: Record<string, unknown>;
  provenance: string;
  provenance_details: Record<string, unknown>;
  import_key: string | null;
  recorded_at: string;
}

export interface DatabaseSnapshot {
  events: DatabaseEventRow[];
  assessments: DatabaseAssessmentRow[];
  stories: DatabaseStoryRow[];
  history: DatabaseHistoryRow[];
  dataUpdatedAt: string;
}

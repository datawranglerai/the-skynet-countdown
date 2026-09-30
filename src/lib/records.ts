import { cleanMachineCitations, type CsvRecord } from './csv.ts';
import { CRITERIA, SEVERITIES } from './criteria.ts';
import {
  assessmentContentFingerprint,
  assessmentFingerprint,
  editorialContentFingerprint,
  editorialFingerprint,
} from './identity.ts';
import type { Assessment, Editorial, Severity } from './types.ts';

export const ASSESSMENT_HEADERS = [
  'cve_id', 'incident_title', 'incident_date', 'source_url', 'classification', 'total_score',
  'clock_delta_minutes', 'full_trifecta', 't1_score', 't1_rationale', 't2_score', 't2_rationale',
  't3_score', 't3_rationale', 'amp_governance_vacuum_score', 'amp_governance_vacuum_rationale',
  'amp_autonomy_score', 'amp_autonomy_rationale', 'amp_capability_erosion_score',
  'amp_capability_erosion_rationale', 'amp_sentience_score', 'amp_sentience_rationale',
  'amp_physical_score', 'amp_physical_rationale', 'is_leading_indicator', 'leading_indicator_note',
  'scoring_notes',
] as const;

export const STORY_HEADERS = [
  'cve_id', 'headline', 'severity_label', 'clock_delta_label', 'metadata_line', 'the_story',
  'our_take', 'updated_clock_position',
] as const;

const SCORE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  t1: 't1_score',
  t2: 't2_score',
  t3: 't3_score',
  governance: 'amp_governance_vacuum_score',
  autonomy: 'amp_autonomy_score',
  erosion: 'amp_capability_erosion_score',
  sentience: 'amp_sentience_score',
  physical: 'amp_physical_score',
});

const RATIONALE_COLUMNS: Readonly<Record<string, string>> = Object.freeze({
  t1: 't1_rationale',
  t2: 't2_rationale',
  t3: 't3_rationale',
  governance: 'amp_governance_vacuum_rationale',
  autonomy: 'amp_autonomy_rationale',
  erosion: 'amp_capability_erosion_rationale',
  sentience: 'amp_sentience_rationale',
  physical: 'amp_physical_rationale',
});

export interface ParsedAssessmentRecord {
  assessment: Assessment;
  eventId?: string;
  fingerprint: string;
  contentFingerprint: string;
}

export interface ParsedEditorialRecord {
  editorial: Editorial;
  eventId?: string;
  date?: string;
  sourceUrl?: string;
  fingerprint: string;
  contentFingerprint: string;
}


export function requireHeaders(records: CsvRecord[], required: readonly string[], label: string): void {
  if (records.length === 0) throw new Error(`${label} CSV has no data rows`);
  const present = new Set(Object.keys(records[0]));
  const missing = required.filter((header) => !present.has(header));
  if (missing.length > 0) throw new Error(`${label} CSV is missing required columns: ${missing.join(', ')}`);
}

function requiredText(row: CsvRecord, column: string, rowNumber: number, label: string): string {
  const value = cleanMachineCitations(row[column] ?? '');
  if (!value) throw new Error(`${label} row ${rowNumber}: ${column} is required`);
  return value;
}

function validateCveId(value: string, rowNumber: number, label: string): string {
  if (!/^SKYNET-\d{4}-\d{4}$/.test(value)) {
    throw new Error(`${label} row ${rowNumber}: cve_id must match SKYNET-YYYY-NNNN`);
  }
  return value;
}

function optionalText(row: CsvRecord, column: string): string {
  return cleanMachineCitations(row[column] ?? '');
}

function parseNumber(
  value: string,
  rowNumber: number,
  column: string,
  maximum: number,
): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`Assessment row ${rowNumber}: ${column} must be a non-negative number`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number > maximum) {
    throw new Error(`Assessment row ${rowNumber}: ${column} must be between 0 and ${maximum}`);
  }
  return number;
}

function parseInteger(value: string, rowNumber: number, column: string, maximum: number): number {
  const number = parseNumber(value, rowNumber, column, maximum);
  if (!Number.isInteger(number)) throw new Error(`Assessment row ${rowNumber}: ${column} must be an integer`);
  return number;
}

function parseBoolean(value: string, rowNumber: number, column: string): boolean {
  if (value === 'TRUE') return true;
  if (value === 'FALSE') return false;
  throw new Error(`Assessment row ${rowNumber}: ${column} must be TRUE or FALSE`);
}

function parseSeverity(value: string, rowNumber: number, label: string): Severity {
  if (SEVERITIES.includes(value as Severity)) return value as Severity;
  throw new Error(`${label} row ${rowNumber}: invalid severity ${JSON.stringify(value)}`);
}

function validateDate(value: string, rowNumber: number, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = match ? new Date(`${value}T00:00:00Z`) : undefined;
  if (
    !match ||
    !parsed ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`${label} row ${rowNumber}: invalid ISO date ${JSON.stringify(value)}`);
  }
  return value;
}

function validateUrl(value: string, rowNumber: number, label: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`${label} row ${rowNumber}: source_url must be an HTTP(S) URL`);
  }
  return value;
}

function expectedSeverity(score: number, fullTrifecta: boolean): Severity {
  if (score >= 10) return 'EXISTENTIAL';
  if (fullTrifecta) return 'CRITICAL';
  if (score <= 2) return 'CANARY';
  if (score <= 4) return 'NOTABLE';
  if (score <= 6) return 'SIGNIFICANT';
  return 'CRITICAL';
}

export interface ParseRecordOptions {
  validateCveFormat?: boolean;
}

export function parseAssessmentRecord(
  row: CsvRecord,
  index = 0,
  options: ParseRecordOptions = {},
): ParsedAssessmentRecord {
  const rowNumber = index + 1;
  const suppliedCveId = requiredText(row, 'cve_id', rowNumber, 'Assessment');
  const cveId = options.validateCveFormat === false
    ? suppliedCveId
    : validateCveId(suppliedCveId, rowNumber, 'Assessment');
  const title = requiredText(row, 'incident_title', rowNumber, 'Assessment');
  const date = validateDate(requiredText(row, 'incident_date', rowNumber, 'Assessment'), rowNumber, 'Assessment');
  const sourceUrl = validateUrl(requiredText(row, 'source_url', rowNumber, 'Assessment'), rowNumber, 'Assessment');
  const severity = parseSeverity(requiredText(row, 'classification', rowNumber, 'Assessment'), rowNumber, 'Assessment');
  const score = parseInteger(row.total_score, rowNumber, 'total_score', 13);
  const legacyMinutes = parseNumber(row.clock_delta_minutes, rowNumber, 'clock_delta_minutes', Number.MAX_SAFE_INTEGER);
  const fullTrifecta = parseBoolean(row.full_trifecta, rowNumber, 'full_trifecta');
  const leadingIndicator = parseBoolean(row.is_leading_indicator, rowNumber, 'is_leading_indicator');
  const scores: Record<string, number> = {};
  const rationales: Record<string, string> = {};

  for (const criterion of CRITERIA) {
    scores[criterion.key] = parseInteger(row[SCORE_COLUMNS[criterion.key]], rowNumber, SCORE_COLUMNS[criterion.key], criterion.max);
    rationales[criterion.key] = requiredText(row, RATIONALE_COLUMNS[criterion.key], rowNumber, 'Assessment');
  }
  const calculatedScore = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (score !== calculatedScore) {
    throw new Error(`Assessment row ${rowNumber}: total_score ${score} does not equal criterion total ${calculatedScore}`);
  }
  const calculatedTrifecta = scores.t1 === 1 && scores.t2 === 1 && scores.t3 === 1;
  if (fullTrifecta !== calculatedTrifecta) {
    throw new Error(`Assessment row ${rowNumber}: full_trifecta does not match t1/t2/t3 scores`);
  }
  if (severity !== expectedSeverity(score, fullTrifecta)) {
    throw new Error(`Assessment row ${rowNumber}: ${severity} does not match the score band`);
  }

  const assessment: Assessment = {
    cveId,
    title,
    date,
    sourceUrl,
    severity,
    score,
    legacyMinutes,
    fullTrifecta,
    leadingIndicator,
    leadingNote: optionalText(row, 'leading_indicator_note'),
    notes: requiredText(row, 'scoring_notes', rowNumber, 'Assessment'),
    scores,
    rationales,
  };
  if (leadingIndicator && !assessment.leadingNote) {
    throw new Error(`Assessment row ${rowNumber}: leading_indicator_note is required when is_leading_indicator is TRUE`);
  }
  return {
    assessment,
    eventId: optionalText(row, 'event_id') || undefined,
    fingerprint: assessmentFingerprint(cveId, date, sourceUrl, score, fullTrifecta),
    contentFingerprint: assessmentContentFingerprint(assessment, optionalText(row, 'event_id')),
  };
}

export function parseEditorialRecord(
  row: CsvRecord,
  index = 0,
  options: ParseRecordOptions = {},
): ParsedEditorialRecord {
  const rowNumber = index + 1;
  const suppliedCveId = requiredText(row, 'cve_id', rowNumber, 'Story');
  const cveId = options.validateCveFormat === false
    ? suppliedCveId
    : validateCveId(suppliedCveId, rowNumber, 'Story');
  const headline = requiredText(row, 'headline', rowNumber, 'Story');
  const dateValue = optionalText(row, 'incident_date') || optionalText(row, 'date');
  const sourceValue = optionalText(row, 'source_url');
  if ((dateValue && !sourceValue) || (!dateValue && sourceValue)) {
    throw new Error(`Story row ${rowNumber}: incident_date and source_url must be supplied together`);
  }
  const editorial: Editorial = {
    cveId,
    headline,
    severity: parseSeverity(requiredText(row, 'severity_label', rowNumber, 'Story'), rowNumber, 'Story'),
    legacyDeltaLabel: requiredText(row, 'clock_delta_label', rowNumber, 'Story'),
    legacyClockPosition: requiredText(row, 'updated_clock_position', rowNumber, 'Story'),
    metadata: requiredText(row, 'metadata_line', rowNumber, 'Story'),
    story: requiredText(row, 'the_story', rowNumber, 'Story'),
    take: requiredText(row, 'our_take', rowNumber, 'Story'),
  };
  if (!/^\+\d+ MINUTES$/.test(editorial.legacyDeltaLabel)) {
    throw new Error(`Story row ${rowNumber}: clock_delta_label must match +N MINUTES`);
  }
  if (!/^\d{1,2}:\d{2}$/.test(editorial.legacyClockPosition)) {
    throw new Error(`Story row ${rowNumber}: updated_clock_position must be a clock value`);
  }
  const identity = {
    eventId: optionalText(row, 'event_id') || undefined,
    date: dateValue || undefined,
    sourceUrl: sourceValue || undefined,
  };
  return {
    editorial,
    eventId: identity.eventId,
    date: dateValue ? validateDate(dateValue, rowNumber, 'Story') : undefined,
    sourceUrl: sourceValue ? validateUrl(sourceValue, rowNumber, 'Story') : undefined,
    fingerprint: editorialFingerprint(cveId, headline),
    contentFingerprint: editorialContentFingerprint(editorial, identity),
  };
}


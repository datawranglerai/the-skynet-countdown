import type { Assessment, Dataset, Editorial, Incident, RiskScore, RiskSeverity, Severity } from './types.ts';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const SEVERITIES = new Set<Severity>(['CANARY', 'NOTABLE', 'SIGNIFICANT', 'CRITICAL', 'EXISTENTIAL']);

function expectRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${path} must be an object.`);
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string.`);
  return value;
}

function expectOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return expectString(value, path);
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`);
  return value;
}

function expectSeverity(value: unknown, path: string): Severity {
  const severity = expectString(value, path) as Severity;
  if (!SEVERITIES.has(severity)) throw new Error(`${path} contains an unknown severity.`);
  return severity;
}

function expectRiskSeverity(value: unknown, path: string): RiskSeverity {
  const severity = expectString(value, path);
  if (severity === 'NO_MOVEMENT') return severity;
  return expectSeverity(severity, path);
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}

function stringRecord(value: unknown, path: string): Record<string, string> {
  const record = expectRecord(value, path);
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, expectString(entry, `${path}.${key}`)]));
}

function numberRecord(value: unknown, path: string): Record<string, number> {
  const record = expectRecord(value, path);
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, expectNumber(entry, `${path}.${key}`)]));
}

function decodeAssessment(value: unknown, path: string): Assessment {
  const record = expectRecord(value, path);
  return {
    versionId: expectOptionalString(record.versionId, `${path}.versionId`),
    cveId: expectString(record.cveId, `${path}.cveId`),
    title: expectString(record.title, `${path}.title`),
    date: expectString(record.date, `${path}.date`),
    sourceUrl: expectString(record.sourceUrl, `${path}.sourceUrl`),
    severity: expectSeverity(record.severity, `${path}.severity`),
    score: expectNumber(record.score, `${path}.score`),
    legacyMinutes: expectNumber(record.legacyMinutes, `${path}.legacyMinutes`),
    fullTrifecta: expectBoolean(record.fullTrifecta, `${path}.fullTrifecta`),
    leadingIndicator: expectBoolean(record.leadingIndicator, `${path}.leadingIndicator`),
    leadingNote: expectString(record.leadingNote, `${path}.leadingNote`),
    notes: expectString(record.notes, `${path}.notes`),
    scores: numberRecord(record.scores, `${path}.scores`),
    rationales: stringRecord(record.rationales, `${path}.rationales`),
  };
}

function decodeEditorial(value: unknown, path: string): Editorial {
  const record = expectRecord(value, path);
  return {
    versionId: expectOptionalString(record.versionId, `${path}.versionId`),
    cveId: expectString(record.cveId, `${path}.cveId`),
    headline: expectString(record.headline, `${path}.headline`),
    severity: expectSeverity(record.severity, `${path}.severity`),
    legacyDeltaLabel: expectString(record.legacyDeltaLabel, `${path}.legacyDeltaLabel`),
    legacyClockPosition: expectString(record.legacyClockPosition, `${path}.legacyClockPosition`),
    metadata: expectString(record.metadata, `${path}.metadata`),
    story: expectString(record.story, `${path}.story`),
    take: expectString(record.take, `${path}.take`),
  };
}

function decodeRiskScore(value: unknown, path: string): RiskScore {
  const record = expectRecord(value, path);
  return {
    trifectaCount: expectNumber(record.trifectaCount, `${path}.trifectaCount`),
    trifectaPoints: expectNumber(record.trifectaPoints, `${path}.trifectaPoints`),
    amplifierPoints: expectNumber(record.amplifierPoints, `${path}.amplifierPoints`),
    totalPoints: expectNumber(record.totalPoints, `${path}.totalPoints`),
    severity: expectRiskSeverity(record.severity, `${path}.severity`),
  };
}

const sameAssessment = (left: Assessment, right: Assessment) =>
  left.cveId === right.cveId && left.date === right.date && left.sourceUrl === right.sourceUrl
  && left.title === right.title && left.score === right.score;

const sameEditorial = (left: Editorial, right: Editorial) =>
  left.cveId === right.cveId && left.headline === right.headline
  && left.story === right.story && left.take === right.take;

function canonicalVersion<T extends { versionId?: string }>(
  selected: T,
  versions: T[],
  path: string,
  legacyMatch: (left: T, right: T) => boolean,
): T {
  const matches = selected.versionId
    ? versions.filter((version) => version.versionId === selected.versionId)
    : versions.filter((version) => legacyMatch(version, selected));
  if (matches.length !== 1) throw new Error(`${path} does not match exactly one version in the incident record.`);
  return matches[0];
}

function decodeIncident(value: unknown, index: number): Incident {
  const path = `dataset.incidents[${index}]`;
  const record = expectRecord(value, path);
  const assessments = expectArray(record.assessments, `${path}.assessments`).map((assessment, versionIndex) =>
    decodeAssessment(assessment, `${path}.assessments[${versionIndex}]`));
  const editorials = expectArray(record.editorials, `${path}.editorials`).map((editorial, versionIndex) =>
    decodeEditorial(editorial, `${path}.editorials[${versionIndex}]`));
  if (!assessments.length) throw new Error(`${path}.assessments must include at least one version.`);

  const selectedAssessment = decodeAssessment(record.assessment, `${path}.assessment`);
  const selectedEditorial = record.editorial === undefined
    ? undefined
    : decodeEditorial(record.editorial, `${path}.editorial`);

  return {
    id: expectString(record.id, `${path}.id`),
    publicId: expectOptionalString(record.publicId, `${path}.publicId`),
    eventKey: expectString(record.eventKey, `${path}.eventKey`),
    assessment: canonicalVersion(selectedAssessment, assessments, `${path}.assessment`, sameAssessment),
    assessments,
    editorial: selectedEditorial
      ? canonicalVersion(selectedEditorial, editorials, `${path}.editorial`, sameEditorial)
      : undefined,
    editorials,
    editorialMatchesAssessment: expectBoolean(record.editorialMatchesAssessment, `${path}.editorialMatchesAssessment`),
    editorialAssessmentScore: record.editorialAssessmentScore === undefined
      ? undefined
      : expectNumber(record.editorialAssessmentScore, `${path}.editorialAssessmentScore`),
    headline: expectString(record.headline, `${path}.headline`),
    selectionRationale: expectString(record.selectionRationale, `${path}.selectionRationale`),
    scoring: decodeRiskScore(record.scoring, `${path}.scoring`),
    effectivePoints: expectNumber(record.effectivePoints, `${path}.effectivePoints`),
    gapClosedPercent: expectNumber(record.gapClosedPercent, `${path}.gapClosedPercent`),
    cumulativePoints: expectNumber(record.cumulativePoints, `${path}.cumulativePoints`),
    remainingSeconds: expectNumber(record.remainingSeconds, `${path}.remainingSeconds`),
    movementSeconds: expectNumber(record.movementSeconds, `${path}.movementSeconds`),
  };
}

/** Validate an API payload and restore selected-version object references lost in JSON. */
export function decodeDataset(value: unknown): Dataset {
  const record = expectRecord(value, 'dataset');
  const source = record.source === undefined ? undefined : expectString(record.source, 'dataset.source');
  if (source !== undefined && source !== 'postgresql' && source !== 'fixture') {
    throw new Error('dataset.source must be postgresql or fixture.');
  }
  return {
    source,
    generatedAt: expectOptionalString(record.generatedAt, 'dataset.generatedAt'),
    dataUpdatedAt: expectOptionalString(record.dataUpdatedAt, 'dataset.dataUpdatedAt'),
    incidents: expectArray(record.incidents, 'dataset.incidents').map(decodeIncident),
    assessmentCount: expectNumber(record.assessmentCount, 'dataset.assessmentCount'),
    editorialCount: expectNumber(record.editorialCount, 'dataset.editorialCount'),
    duplicateCount: expectNumber(record.duplicateCount, 'dataset.duplicateCount'),
    matchedEditorialCount: expectNumber(record.matchedEditorialCount, 'dataset.matchedEditorialCount'),
    diagnostics: expectArray(record.diagnostics, 'dataset.diagnostics').map((diagnostic, index) =>
      expectString(diagnostic, `dataset.diagnostics[${index}]`)),
    totalPoints: expectNumber(record.totalPoints, 'dataset.totalPoints'),
    remainingSeconds: expectNumber(record.remainingSeconds, 'dataset.remainingSeconds'),
    pressure: expectNumber(record.pressure, 'dataset.pressure'),
    lastUpdated: expectString(record.lastUpdated, 'dataset.lastUpdated'),
  };
}

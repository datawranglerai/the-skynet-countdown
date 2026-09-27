import {
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
  effectivePoints,
} from './calibration.ts';
import { cleanMachineCitations, parseCsv, stableContentFingerprint, type CsvRecord } from './csv.ts';
import { CRITERIA, SEVERITIES } from './criteria.ts';
import {
  assessmentFingerprint,
  assessmentContentFingerprint,
  editorialFingerprint,
  editorialContentFingerprint,
  HISTORICAL_MANIFEST,
  sourceDateAlias,
  type HistoricalEventManifest,
} from './manifest.ts';
import type { Assessment, Dataset, Editorial, Incident, Severity } from './types.ts';

const ASSESSMENT_HEADERS = [
  'cve_id', 'incident_title', 'incident_date', 'source_url', 'classification', 'total_score',
  'clock_delta_minutes', 'full_trifecta', 't1_score', 't1_rationale', 't2_score', 't2_rationale',
  't3_score', 't3_rationale', 'amp_governance_vacuum_score', 'amp_governance_vacuum_rationale',
  'amp_autonomy_score', 'amp_autonomy_rationale', 'amp_capability_erosion_score',
  'amp_capability_erosion_rationale', 'amp_sentience_score', 'amp_sentience_rationale',
  'amp_physical_score', 'amp_physical_rationale', 'is_leading_indicator', 'leading_indicator_note',
  'scoring_notes',
] as const;

const STORY_HEADERS = [
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

interface ParsedAssessment {
  assessment: Assessment;
  eventId?: string;
  fingerprint: string;
  contentFingerprint: string;
}

interface ParsedEditorial {
  editorial: Editorial;
  eventId?: string;
  date?: string;
  sourceUrl?: string;
  fingerprint: string;
  contentFingerprint: string;
}

interface WorkingIncident {
  id: string;
  eventKey: string;
  manifest?: HistoricalEventManifest;
  hasExplicitEventId: boolean;
  assessment: Assessment;
  assessmentFingerprint: string;
  assessmentContentFingerprint: string;
  assessments: Assessment[];
  assessmentFingerprints: Set<string>;
  assessmentContentFingerprints: Set<string>;
  assessmentContentByAssessment: Map<Assessment, string>;
  editorials: Array<{
    editorial: Editorial;
    assessmentFingerprint?: string;
    assessmentScore?: number;
    assessmentContentFingerprint?: string;
    preferred: boolean;
    fingerprint: string;
  }>;
  selectionRationale: string;
}

function requireHeaders(records: CsvRecord[], required: readonly string[], label: string): void {
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

function parseAssessmentRow(row: CsvRecord, index: number): ParsedAssessment {
  const rowNumber = index + 1;
  const cveId = validateCveId(requiredText(row, 'cve_id', rowNumber, 'Assessment'), rowNumber, 'Assessment');
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

function parseEditorialRow(row: CsvRecord, index: number): ParsedEditorial {
  const rowNumber = index + 1;
  const cveId = validateCveId(requiredText(row, 'cve_id', rowNumber, 'Story'), rowNumber, 'Story');
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

function compareAssessments(left: Assessment, right: Assessment): number {
  return left.cveId.localeCompare(right.cveId) || left.title.localeCompare(right.title);
}

export interface LoadDatasetOptions {
  manifest?: readonly HistoricalEventManifest[];
}

export function loadDataset(
  assessmentCsv: string,
  storyCsv: string,
  options: LoadDatasetOptions = {},
): Dataset {
  const assessmentRows = parseCsv(assessmentCsv);
  const storyRows = parseCsv(storyCsv);
  requireHeaders(assessmentRows, ASSESSMENT_HEADERS, 'Assessment');
  requireHeaders(storyRows, STORY_HEADERS, 'Story');

  const parsedAssessments = assessmentRows.map(parseAssessmentRow);
  const parsedEditorials = storyRows.map(parseEditorialRow);
  const diagnostics: string[] = [];
  const activeManifest = options.manifest ?? HISTORICAL_MANIFEST;
  const manifestByAlias = new Map<string, HistoricalEventManifest>();
  const manifestById = new Map<string, HistoricalEventManifest>();
  for (const entry of activeManifest) {
    if (manifestById.has(entry.id)) throw new Error(`Historical manifest repeats id ${entry.id}`);
    manifestById.set(entry.id, entry);
    if (!entry.assessmentContentFingerprints.includes(entry.selectedAssessmentContentFingerprint)) {
      diagnostics.push(`Historical manifest ${entry.id} does not include its selected assessment content.`);
    }
    if (new Set(entry.assessmentContentFingerprints).size !== entry.assessmentContentFingerprints.length) {
      diagnostics.push(`Historical manifest ${entry.id} repeats an assessment content fingerprint.`);
    }
    for (const alias of entry.aliases) {
      if (manifestByAlias.has(alias)) throw new Error(`Historical manifest repeats alias ${alias}`);
      manifestByAlias.set(alias, entry);
    }
  }

  const grouped = new Map<string, { manifest?: HistoricalEventManifest; values: ParsedAssessment[] }>();
  for (const parsed of parsedAssessments) {
    const alias = sourceDateAlias(parsed.assessment.date, parsed.assessment.sourceUrl);
    const aliasManifest = manifestByAlias.get(alias);
    const idManifest = parsed.eventId ? manifestById.get(parsed.eventId) : undefined;
    if (aliasManifest && parsed.eventId && parsed.eventId !== aliasManifest.id) {
      diagnostics.push(`Assessment for ${aliasManifest.id} supplies conflicting event_id ${parsed.eventId}; the audited historical id remains authoritative.`);
    }
    if (aliasManifest && idManifest && aliasManifest !== idManifest) {
      diagnostics.push(`Assessment alias for ${aliasManifest.id} conflicts with manifest event_id ${idManifest.id}.`);
    }
    const manifest = aliasManifest ?? idManifest;
    const groupKey = manifest ? `manifest:${manifest.id}` : parsed.eventId ? `explicit:${parsed.eventId}` : `source:${alias}`;
    const current = grouped.get(groupKey);
    if (current) current.values.push(parsed);
    else grouped.set(groupKey, { manifest, values: [parsed] });
  }

  const working: WorkingIncident[] = [];
  for (const [groupKey, group] of grouped) {
    const distinctFingerprints = new Set(group.values.map((value) => value.fingerprint));
    let selected = group.values[0];
    let selectionRationale = 'A newly appended, unique source/date event has one assessment.';
    if (group.manifest) {
      const allowed = new Set([
        group.manifest.selectedAssessmentFingerprint,
        ...group.manifest.storyLinks.map((link) => link.assessmentFingerprint),
      ]);
      for (const fingerprint of distinctFingerprints) {
        if (!allowed.has(fingerprint)) {
          diagnostics.push(`Unreviewed assessment revision for ${group.manifest.id} (${fingerprint}); update the audited manifest.`);
        }
      }
      const allowedContent = new Set(group.manifest.assessmentContentFingerprints);
      for (const value of group.values) {
        if (!allowedContent.has(value.contentFingerprint)) {
          diagnostics.push(`Unreviewed assessment content for ${group.manifest.id} (${value.contentFingerprint}); update the audited manifest.`);
        }
      }
      const authoritative = group.values.filter(
        (value) => value.contentFingerprint === group.manifest?.selectedAssessmentContentFingerprint,
      );
      if (authoritative.length !== 1) {
        diagnostics.push(`Historical event ${group.manifest.id} must contain exactly one selected assessment; found ${authoritative.length}.`);
      } else {
        selected = authoritative[0];
        if (selected.fingerprint !== group.manifest.selectedAssessmentFingerprint) {
          diagnostics.push(`Historical event ${group.manifest.id} selected content does not match its selected assessment identity.`);
        }
      }
      selectionRationale = group.manifest.selectionRationale;
    } else if (
      distinctFingerprints.size > 1 ||
      new Set(group.values.map((value) => value.contentFingerprint)).size > 1
    ) {
      diagnostics.push(`Conflicting assessments for ${groupKey}; add an explicit audited selection.`);
    }

    const suppliedIds = new Set(group.values.map((value) => value.eventId).filter((value): value is string => Boolean(value)));
    const explicitId = group.manifest?.id ?? (suppliedIds.size === 1 ? [...suppliedIds][0] : undefined);
    if (suppliedIds.size > 1) {
      diagnostics.push(`Mixed event_id values in ${groupKey}.`);
    }
    const alias = sourceDateAlias(selected.assessment.date, selected.assessment.sourceUrl);
    const id = explicitId || group.manifest?.id || `event-${selected.assessment.date}-${stableContentFingerprint([alias])}`;
    working.push({
      id,
      eventKey: explicitId || alias,
      manifest: group.manifest,
      hasExplicitEventId: suppliedIds.size > 0,
      assessment: selected.assessment,
      assessmentFingerprint: selected.fingerprint,
      assessmentContentFingerprint: selected.contentFingerprint,
      assessments: group.values.map((value) => value.assessment).sort(compareAssessments),
      assessmentFingerprints: new Set(group.values.map((value) => value.fingerprint)),
      assessmentContentFingerprints: new Set(group.values.map((value) => value.contentFingerprint)),
      assessmentContentByAssessment: new Map(
        group.values.map((value) => [value.assessment, value.contentFingerprint]),
      ),
      editorials: [],
      selectionRationale,
    });
  }

  const assessmentContentCounts = new Map<string, number>();
  for (const parsed of parsedAssessments) {
    assessmentContentCounts.set(parsed.contentFingerprint, (assessmentContentCounts.get(parsed.contentFingerprint) ?? 0) + 1);
  }
  for (const entry of activeManifest) {
    for (const fingerprint of entry.assessmentContentFingerprints) {
      const count = assessmentContentCounts.get(fingerprint) ?? 0;
      if (count !== 1) {
        diagnostics.push(`Historical event ${entry.id} requires assessment content ${fingerprint}; found ${count}.`);
      }
    }
  }

  const incidentIds = new Set<string>();
  for (const incident of working) {
    if (incidentIds.has(incident.id)) diagnostics.push(`Duplicate incident id ${incident.id}.`);
    incidentIds.add(incident.id);
  }

  const incidentById = new Map(working.map((incident) => [incident.id, incident]));
  const incidentByAlias = new Map(working.map((incident) => [sourceDateAlias(incident.assessment.date, incident.assessment.sourceUrl), incident]));
  const storyLinks = new Map<string, Array<{ event: HistoricalEventManifest; link: HistoricalEventManifest['storyLinks'][number] }>>();
  for (const entry of activeManifest) {
    for (const link of entry.storyLinks) {
      const links = storyLinks.get(link.storyFingerprint) ?? [];
      links.push({ event: entry, link });
      storyLinks.set(link.storyFingerprint, links);
    }
  }
  const eventsByCve = new Map<string, Set<WorkingIncident>>();
  for (const incident of working) {
    for (const cveId of new Set(incident.assessments.map((assessment) => assessment.cveId))) {
      const values = eventsByCve.get(cveId) ?? new Set<WorkingIncident>();
      values.add(incident);
      eventsByCve.set(cveId, values);
    }
  }
  for (const [cveId, candidates] of eventsByCve) {
    if (
      candidates.size > 1 &&
      [...candidates].some((incident) => !incident.manifest && !incident.hasExplicitEventId)
    ) {
      diagnostics.push(`Legacy id ${cveId} appears across unrelated new events; add explicit event_id values.`);
    }
  }
  const storiesPerCve = new Map<string, number>();
  for (const parsed of parsedEditorials) {
    storiesPerCve.set(parsed.editorial.cveId, (storiesPerCve.get(parsed.editorial.cveId) ?? 0) + 1);
  }

  const editorialContentCounts = new Map<string, number>();
  for (const parsed of parsedEditorials) {
    editorialContentCounts.set(parsed.contentFingerprint, (editorialContentCounts.get(parsed.contentFingerprint) ?? 0) + 1);
  }
  for (const entry of activeManifest) {
    for (const link of entry.storyLinks) {
      const count = editorialContentCounts.get(link.storyContentFingerprint) ?? 0;
      if (count !== 1) {
        diagnostics.push(`Historical event ${entry.id} requires editorial content ${link.storyContentFingerprint}; found ${count}.`);
      }
    }
  }

  let matchedEditorialCount = 0;
  for (const parsed of parsedEditorials) {
    let target: WorkingIncident | undefined;
    let linkedAssessment: string | undefined;
    let linkedAssessmentContent: string | undefined;
    let preferred = false;
    const auditedCandidates = storyLinks.get(parsed.fingerprint);
    const exactAuditedLinks = auditedCandidates?.filter(
      ({ link }) => link.storyContentFingerprint === parsed.contentFingerprint,
    ) ?? [];
    const auditedLink = exactAuditedLinks.length === 1 ? exactAuditedLinks[0] : undefined;
    if (parsed.eventId) {
      target = incidentById.get(parsed.eventId);
      if (!target) diagnostics.push(`Story ${parsed.editorial.headline} references unknown event_id ${parsed.eventId}.`);
    } else if (parsed.date && parsed.sourceUrl) {
      target = incidentByAlias.get(sourceDateAlias(parsed.date, parsed.sourceUrl));
      if (!target) diagnostics.push(`Story ${parsed.editorial.headline} has no assessment with its source/date.`);
    } else if (auditedCandidates) {
      if (exactAuditedLinks.length > 1) {
        diagnostics.push(`Audited story ${parsed.editorial.headline} has multiple manifest targets for the same content.`);
      } else if (!auditedLink) {
        diagnostics.push(`Audited story ${parsed.editorial.headline} has unreviewed content; update the manifest.`);
      } else {
        target = incidentById.get(auditedLink.event.id);
        linkedAssessment = auditedLink.link.assessmentFingerprint;
        linkedAssessmentContent = auditedLink.link.assessmentContentFingerprint;
        preferred = auditedLink.link.preferred ?? false;
      }
      if (target && !target.assessmentContentFingerprints.has(linkedAssessmentContent ?? '')) {
        diagnostics.push(`Audited story ${parsed.editorial.headline} is missing its linked assessment version.`);
        target = undefined;
      }
    } else {
      const candidates = eventsByCve.get(parsed.editorial.cveId);
      if (candidates?.size === 1 && storiesPerCve.get(parsed.editorial.cveId) === 1) {
        target = [...candidates][0];
      } else {
        diagnostics.push(`Ambiguous or unmatched story ${parsed.editorial.headline}; add event_id or an audited content link.`);
      }
    }
    if (target) {
      if (!linkedAssessment) {
        const matchingVersions = target.assessments.filter(
          (assessment) => assessment.cveId === parsed.editorial.cveId,
        );
        const inferred = matchingVersions.length === 1
          ? matchingVersions[0]
          : target.assessments.length === 1 ? target.assessments[0] : undefined;
        if (inferred) {
          linkedAssessment = assessmentFingerprint(
            inferred.cveId, inferred.date, inferred.sourceUrl, inferred.score, inferred.fullTrifecta,
          );
          linkedAssessmentContent = target.assessmentContentByAssessment.get(inferred);
        }
      }
      const linkedVersion = target.assessments.find((assessment) =>
        target.assessmentContentByAssessment.get(assessment) === linkedAssessmentContent,
      );
      if (linkedVersion) {
        const actualIdentity = assessmentFingerprint(
          linkedVersion.cveId,
          linkedVersion.date,
          linkedVersion.sourceUrl,
          linkedVersion.score,
          linkedVersion.fullTrifecta,
        );
        if (linkedAssessment && actualIdentity !== linkedAssessment) {
          diagnostics.push(`Story ${parsed.editorial.headline} links assessment content to the wrong assessment identity.`);
        }
      }
      target.editorials.push({
        editorial: parsed.editorial,
        assessmentFingerprint: linkedAssessment,
        assessmentScore: linkedVersion?.score,
        assessmentContentFingerprint: linkedAssessmentContent,
        preferred,
        fingerprint: parsed.fingerprint,
      });
      matchedEditorialCount += 1;
    }
  }

  working.sort((left, right) => left.assessment.date.localeCompare(right.assessment.date) || left.id.localeCompare(right.id));
  let cumulativePoints = 0;
  const incidents: Incident[] = working.map((value) => {
    const points = effectivePoints(value.assessment.score, value.assessment.fullTrifecta);
    const priorPoints = cumulativePoints;
    const nextCumulativePoints = cumulativePoints + points;
    if (!Number.isSafeInteger(nextCumulativePoints)) {
      throw new RangeError('Cumulative evidence points must remain a non-negative safe integer');
    }
    cumulativePoints = nextCumulativePoints;
    const clock = calculateClock(cumulativePoints);
    const sortedEditorials = value.editorials.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
    const preferredEditorials = sortedEditorials.filter((entry) => entry.preferred);
    if (preferredEditorials.length > 1) {
      diagnostics.push(`Event ${value.id} has multiple preferred editorial versions.`);
    }
    const matchingEditorials = sortedEditorials.filter(
      (entry) => entry.assessmentContentFingerprint === value.assessmentContentFingerprint,
    );
    if (preferredEditorials.length === 0 && matchingEditorials.length > 1) {
      diagnostics.push(`Event ${value.id} has multiple editorial versions for the selected assessment; mark one preferred.`);
    }
    const canonicalEntry = preferredEditorials[0] ?? matchingEditorials[0] ?? sortedEditorials[0];
    const canonicalEditorial = canonicalEntry?.editorial;
    const incident: Incident = {
      id: value.id,
      eventKey: value.eventKey,
      assessment: value.assessment,
      assessments: value.assessments,
      editorial: canonicalEditorial,
      editorials: sortedEditorials.map((entry) => entry.editorial),
      editorialMatchesAssessment: canonicalEntry?.assessmentContentFingerprint === value.assessmentContentFingerprint,
      editorialAssessmentScore: canonicalEntry?.assessmentScore,
      headline: canonicalEditorial?.headline ?? value.assessment.title,
      selectionRationale: value.selectionRationale,
      effectivePoints: points,
      gapClosedPercent: calculateGapClosedPercent(points),
      cumulativePoints,
      remainingSeconds: clock.remainingSeconds,
      movementSeconds: calculateMovementSeconds(priorPoints, points),
    };
    return incident;
  });
  const clock = calculateClock(cumulativePoints);

  return {
    incidents,
    assessmentCount: parsedAssessments.length,
    editorialCount: parsedEditorials.length,
    duplicateCount: parsedAssessments.length - incidents.length,
    matchedEditorialCount,
    diagnostics,
    totalPoints: cumulativePoints,
    remainingSeconds: clock.remainingSeconds,
    pressure: clock.pressure,
    lastUpdated: incidents.reduce((latest, incident) => incident.assessment.date > latest ? incident.assessment.date : latest, ''),
  };
}

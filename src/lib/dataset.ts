import {
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
} from './calibration.ts';
import { parseCsv, stableContentFingerprint } from './csv.ts';
import { assessmentFingerprint, sourceDateAlias } from './identity.ts';
import {
  HISTORICAL_MANIFEST,
  type HistoricalEventManifest,
} from './manifest.ts';
import {
  ASSESSMENT_HEADERS,
  STORY_HEADERS,
  parseAssessmentRecord,
  parseEditorialRecord,
  requireHeaders,
  type ParsedAssessmentRecord,
} from './records.ts';
export {
  ASSESSMENT_HEADERS,
  STORY_HEADERS,
  parseAssessmentRecord,
  parseEditorialRecord,
  type ParsedAssessmentRecord,
  type ParsedEditorialRecord,
  type ParseRecordOptions,
} from './records.ts';
import type { Assessment, Dataset, Editorial, Incident } from './types.ts';
import { calculateRiskScore } from './scoring.ts';


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

  // Repeated export rows are copies, not new assessment versions. Validate every
  // row, then reconcile each distinct full-content record once.
  const parsedAssessments = [...new Map(
    assessmentRows.map((row, index) => parseAssessmentRecord(row, index)).map((value) => [value.contentFingerprint, value]),
  ).values()];
  const parsedEditorials = storyRows.map((row, index) => parseEditorialRecord(row, index));
  const diagnostics: string[] = [];
  const activeManifest = options.manifest ?? HISTORICAL_MANIFEST;
  const manifestByAlias = new Map<string, HistoricalEventManifest>();
  const manifestById = new Map<string, HistoricalEventManifest>();
  const assessmentContentOwners = new Map<string, string>();
  for (const entry of activeManifest) {
    if (manifestById.has(entry.id)) throw new Error(`Historical manifest repeats id ${entry.id}`);
    manifestById.set(entry.id, entry);
    if (!entry.assessmentContentFingerprints.includes(entry.selectedAssessmentContentFingerprint)) {
      diagnostics.push(`Historical manifest ${entry.id} does not include its selected assessment content.`);
    }
    if (new Set(entry.assessmentContentFingerprints).size !== entry.assessmentContentFingerprints.length) {
      diagnostics.push(`Historical manifest ${entry.id} repeats an assessment content fingerprint.`);
    }
    for (const fingerprint of entry.assessmentContentFingerprints) {
      const owner = assessmentContentOwners.get(fingerprint);
      if (owner && owner !== entry.id) {
        diagnostics.push(`Assessment content ${fingerprint} is assigned to multiple historical events: ${owner}, ${entry.id}.`);
      }
      assessmentContentOwners.set(fingerprint, entry.id);
    }
    for (const alias of entry.aliases) {
      if (manifestByAlias.has(alias)) throw new Error(`Historical manifest repeats alias ${alias}`);
      manifestByAlias.set(alias, entry);
    }
  }

  const grouped = new Map<string, { manifest?: HistoricalEventManifest; values: ParsedAssessmentRecord[] }>();
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
      // Full-content approval includes identity, scores and rationales. An
      // approved alternate assessment does not need its own editorial report.
      const allowedContent = new Set(group.manifest.assessmentContentFingerprints);
      const presentContent = new Set(group.values.map((value) => value.contentFingerprint));
      for (const fingerprint of allowedContent) {
        if (!presentContent.has(fingerprint)) {
          diagnostics.push(`Historical event ${group.manifest.id} does not contain its audited assessment content ${fingerprint}.`);
        }
      }
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
  const incidentByAlias = new Map(working.flatMap((incident) => [
    ...(incident.manifest?.aliases ?? []),
    ...incident.assessments.map((assessment) => sourceDateAlias(assessment.date, assessment.sourceUrl)),
  ].map((alias) => [alias, incident] as const)));
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
        assessmentScore: linkedVersion ? calculateRiskScore(linkedVersion.scores).totalPoints : undefined,
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
    const scoring = calculateRiskScore(value.assessment.scores);
    const points = scoring.totalPoints;
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
      scoring,
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
    assessmentCount: assessmentRows.length,
    editorialCount: parsedEditorials.length,
    duplicateCount: assessmentRows.length - incidents.length,
    matchedEditorialCount,
    diagnostics,
    totalPoints: cumulativePoints,
    remainingSeconds: clock.remainingSeconds,
    pressure: clock.pressure,
    lastUpdated: incidents.reduce((latest, incident) => incident.assessment.date > latest ? incident.assessment.date : latest, ''),
  };
}

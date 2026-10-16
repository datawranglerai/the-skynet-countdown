export type Severity = 'CANARY' | 'NOTABLE' | 'SIGNIFICANT' | 'CRITICAL' | 'EXISTENTIAL';

export interface Criterion {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  max: number;
  tier: 'trifecta' | 'amplifier';
  scoreDescriptions?: readonly string[];
}

export type RiskSeverity = 'NO_MOVEMENT' | Severity;

export type ClockPhase = 'approach' | 'event-horizon';

export interface EventHorizonApproval {
  approvedBy: string;
  approvedAt: string;
  effectiveAfter: { date: string; incidentId: string };
  rationale: string;
  editorialUrl: string;
}

export interface ClockTransition {
  afterIncidentId: string;
  remainingSecondsBefore: number;
  adjustmentSeconds: number;
}

export interface DatasetClock {
  phase: ClockPhase;
  phasePoints: number;
  approval: EventHorizonApproval | null;
  transition: ClockTransition | null;
}

export interface RiskScore {
  trifectaCount: number;
  trifectaPoints: number;
  amplifierPoints: number;
  totalPoints: number;
  severity: RiskSeverity;
}

export interface Assessment {
  versionId?: string;
  cveId: string;
  title: string;
  date: string;
  sourceUrl: string;
  severity: Severity;
  score: number;
  legacyMinutes: number;
  fullTrifecta: boolean;
  leadingIndicator: boolean;
  leadingNote: string;
  notes: string;
  scores: Record<string, number>;
  rationales: Record<string, string>;
}

export interface Editorial {
  versionId?: string;
  cveId: string;
  headline: string;
  severity: Severity;
  legacyDeltaLabel: string;
  legacyClockPosition: string;
  metadata: string;
  story: string;
  take: string;
}

export interface IncidentRecordSummary {
  firstRecordedAt: string;
  initialScore: number;
  lastUpdatedAt: string;
}

export interface Incident {
  id: string;
  routeAliases?: string[];
  publicId?: string;
  eventKey: string;
  assessment: Assessment;
  assessments: Assessment[];
  editorial?: Editorial;
  editorials: Editorial[];
  editorialMatchesAssessment: boolean;
  editorialAssessmentScore?: number;
  headline: string;
  selectionRationale: string;
  recordSummary?: IncidentRecordSummary;
  scoring: RiskScore;
  clockPhase: ClockPhase;
  phaseCumulativePoints: number;
  effectivePoints: number;
  gapClosedPercent: number;
  cumulativePoints: number;
  remainingSeconds: number;
  movementSeconds: number;
}

export interface Dataset {
  source?: 'postgresql' | 'fixture';
  generatedAt?: string;
  dataUpdatedAt?: string;
  incidents: Incident[];
  assessmentCount: number;
  editorialCount: number;
  duplicateCount: number;
  matchedEditorialCount: number;
  diagnostics: string[];
  clock: DatasetClock;
  totalPoints: number;
  remainingSeconds: number;
  pressure: number;
  lastUpdated: string;
}

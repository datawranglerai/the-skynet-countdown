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

export interface RiskScore {
  trifectaCount: number;
  trifectaPoints: number;
  amplifierPoints: number;
  totalPoints: number;
  severity: RiskSeverity;
}

export interface Assessment {
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
  cveId: string;
  headline: string;
  severity: Severity;
  legacyDeltaLabel: string;
  legacyClockPosition: string;
  metadata: string;
  story: string;
  take: string;
}

export interface Incident {
  id: string;
  eventKey: string;
  assessment: Assessment;
  assessments: Assessment[];
  editorial?: Editorial;
  editorials: Editorial[];
  editorialMatchesAssessment: boolean;
  editorialAssessmentScore?: number;
  headline: string;
  selectionRationale: string;
  scoring: RiskScore;
  effectivePoints: number;
  gapClosedPercent: number;
  cumulativePoints: number;
  remainingSeconds: number;
  movementSeconds: number;
}

export interface Dataset {
  incidents: Incident[];
  assessmentCount: number;
  editorialCount: number;
  duplicateCount: number;
  matchedEditorialCount: number;
  diagnostics: string[];
  totalPoints: number;
  remainingSeconds: number;
  pressure: number;
  lastUpdated: string;
}

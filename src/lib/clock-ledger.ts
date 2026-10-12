import {
  CALIBRATION,
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
} from './calibration.ts';
import type { ClockPhase, DatasetClock, EventHorizonApproval } from './types.ts';

export interface ClockLedgerEntry {
  id: string;
  routeAliases?: readonly string[];
  date: string;
  score: number;
}

export interface ClockLedgerResultEntry extends ClockLedgerEntry {
  clockPhase: ClockPhase;
  phaseCumulativePoints: number;
  effectivePoints: number;
  gapClosedPercent: number;
  cumulativePoints: number;
  remainingSeconds: number;
  movementSeconds: number;
}

export interface ClockLedgerResult {
  entries: ClockLedgerResultEntry[];
  totalPoints: number;
  remainingSeconds: number;
  pressure: number;
  clock: DatasetClock;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be non-empty.`);
}

function requireDate(value: string, label: string): void {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!DATE_PATTERN.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
}

function requireApprovalUrl(value: string): void {
  if (/^#\/[A-Za-z0-9/_-]+$/.test(value)) return;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Event Horizon approval editorialUrl must be a safe HTTP(S) URL or internal hash route.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Event Horizon approval editorialUrl must be a safe HTTP(S) URL or internal hash route.');
  }
}

function validateApproval(approval: EventHorizonApproval): void {
  requireText(approval.approvedBy, 'Event Horizon approval approvedBy');
  requireText(approval.rationale, 'Event Horizon approval rationale');
  requireText(approval.effectiveAfter?.incidentId, 'Event Horizon approval incidentId');
  requireDate(approval.effectiveAfter?.date, 'Event Horizon approval date');
  const approvedAt = new Date(approval.approvedAt);
  if (!ISO_TIMESTAMP_PATTERN.test(approval.approvedAt) || Number.isNaN(approvedAt.getTime())
    || approvedAt.toISOString().slice(0, 19) !== approval.approvedAt.slice(0, 19)) {
    throw new Error('Event Horizon approval approvedAt must be a valid UTC ISO timestamp.');
  }
  requireApprovalUrl(approval.editorialUrl);
}

function validateEntry(entry: ClockLedgerEntry): void {
  requireText(entry.id, 'Incident id');
  requireDate(entry.date, `Incident ${entry.id} date`);
  if (!Number.isSafeInteger(entry.score) || entry.score < 0 || entry.score > 17) {
    throw new RangeError(`Incident ${entry.id} score must be an integer from 0 to 17.`);
  }
}

export function applyClockLedger(
  input: readonly ClockLedgerEntry[],
  approval: EventHorizonApproval | null = null,
): ClockLedgerResult {
  input.forEach(validateEntry);
  const entries = [...input];
  const claimedRoutes = new Map<string, ClockLedgerEntry>();
  for (const entry of entries) {
    for (const route of [entry.id, ...(entry.routeAliases ?? [])]) {
      requireText(route, `Incident ${entry.id} route`);
      const owner = claimedRoutes.get(route);
      if (owner) throw new Error(`Clock ledger route ${route} is claimed by both ${owner.id} and ${entry.id}.`);
      claimedRoutes.set(route, entry);
    }
  }

  let anchor: ClockLedgerEntry | undefined;
  if (approval) {
    validateApproval(approval);
    anchor = claimedRoutes.get(approval.effectiveAfter.incidentId);
    if (!anchor) throw new Error(`Event Horizon approval anchor ${approval.effectiveAfter.incidentId} is missing.`);
    if (anchor.date !== approval.effectiveAfter.date) {
      throw new Error(`Event Horizon approval anchor date changed from ${approval.effectiveAfter.date} to ${anchor.date}; explicit review is required.`);
    }
  }
  const chronologyId = (entry: ClockLedgerEntry) =>
    entry === anchor ? approval!.effectiveAfter.incidentId : entry.id;
  entries.sort((left, right) =>
    left.date.localeCompare(right.date) || chronologyId(left).localeCompare(chronologyId(right)));

  let cumulativePoints = 0;
  let approachPoints = 0;
  let horizonPoints = 0;
  let phase: ClockPhase = 'approach';
  let transition: DatasetClock['transition'] = null;
  const results: ClockLedgerResultEntry[] = [];
  for (const entry of entries) {
    const afterAnchor = anchor && entry !== anchor
      ? entry.date.localeCompare(approval!.effectiveAfter.date) > 0
        || (entry.date === approval!.effectiveAfter.date
          && entry.id.localeCompare(approval!.effectiveAfter.incidentId) > 0)
      : false;
    const nextPhase: ClockPhase = afterAnchor ? 'event-horizon' : 'approach';
    if (nextPhase === 'event-horizon' && phase === 'approach') {
      const remainingSecondsBefore = calculateClock(approachPoints, 'approach').remainingSeconds;
      transition = {
        afterIncidentId: anchor!.id,
        remainingSecondsBefore,
        adjustmentSeconds: remainingSecondsBefore - CALIBRATION.horizonSeconds,
      };
      phase = 'event-horizon';
    }

    const effectivePoints = nextPhase === 'approach'
      ? entry.score
      : entry.score >= CALIBRATION.eventHorizonMinimumScore ? entry.score : 0;
    const priorPhasePoints = nextPhase === 'approach' ? approachPoints : horizonPoints;
    if (nextPhase === 'approach') approachPoints += effectivePoints;
    else horizonPoints += effectivePoints;
    cumulativePoints += entry.score;
    if (![approachPoints, horizonPoints, cumulativePoints].every(Number.isSafeInteger)) {
      throw new RangeError('Cumulative evidence points must remain non-negative safe integers.');
    }
    const phaseCumulativePoints = nextPhase === 'approach' ? approachPoints : horizonPoints;
    const clock = calculateClock(phaseCumulativePoints, nextPhase);
    results.push({
      ...entry,
      clockPhase: nextPhase,
      phaseCumulativePoints,
      effectivePoints,
      gapClosedPercent: calculateGapClosedPercent(entry.score, nextPhase),
      cumulativePoints,
      remainingSeconds: clock.remainingSeconds,
      movementSeconds: calculateMovementSeconds(priorPhasePoints, entry.score, nextPhase),
    });
  }

  if (approval && !transition) {
    const remainingSecondsBefore = calculateClock(approachPoints, 'approach').remainingSeconds;
    transition = {
      afterIncidentId: anchor!.id,
      remainingSecondsBefore,
      adjustmentSeconds: remainingSecondsBefore - CALIBRATION.horizonSeconds,
    };
    phase = 'event-horizon';
  }
  const phasePoints = phase === 'approach' ? approachPoints : horizonPoints;
  const finalClock = calculateClock(phasePoints, phase);
  return {
    entries: results,
    totalPoints: cumulativePoints,
    remainingSeconds: finalClock.remainingSeconds,
    pressure: finalClock.pressure,
    clock: { phase, phasePoints, approval, transition },
  };
}

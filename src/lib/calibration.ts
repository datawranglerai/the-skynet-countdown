import type { ClockPhase } from './types.ts';

export const CALIBRATION = Object.freeze({
  version: '1.0' as const,
  effectiveDate: '2026-10-11' as const,
  halfwayPoints: 1_000,
  startingSeconds: 900,
  horizonSeconds: 120,
  eventHorizonHalfwayPoints: 250,
  eventHorizonMinimumScore: 10,
});

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
}

function requirePhase(phase: ClockPhase): void {
  if (phase !== 'approach' && phase !== 'event-horizon') {
    throw new RangeError(`Unknown clock phase: ${String(phase)}`);
  }
}

function phaseHalfwayPoints(phase: ClockPhase): number {
  return phase === 'approach' ? CALIBRATION.halfwayPoints : CALIBRATION.eventHorizonHalfwayPoints;
}

function phaseEventPoints(points: number, phase: ClockPhase): number {
  return phase === 'event-horizon' && points < CALIBRATION.eventHorizonMinimumScore ? 0 : points;
}

function globalPressure(remainingSeconds: number): number {
  return 100 * (CALIBRATION.startingSeconds - remainingSeconds) / CALIBRATION.startingSeconds;
}

export function calculateClock(
  points: number,
  phase: ClockPhase = 'approach',
): { remainingSeconds: number; pressure: number } {
  requireNonNegativeFinite(points, 'Points');
  requirePhase(phase);
  const exponent = (-Math.LN2 * points) / phaseHalfwayPoints(phase);
  if (phase === 'event-horizon') {
    const remainingSeconds = Math.max(Number.MIN_VALUE, CALIBRATION.horizonSeconds * Math.exp(exponent));
    return { remainingSeconds, pressure: globalPressure(remainingSeconds) };
  }
  const approachWindow = CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds;
  const remainingSeconds = Math.max(
    CALIBRATION.horizonSeconds + Number.EPSILON * CALIBRATION.horizonSeconds,
    CALIBRATION.horizonSeconds + approachWindow * Math.exp(exponent),
  );
  return { remainingSeconds, pressure: globalPressure(remainingSeconds) };
}

export function calculateGapClosedPercent(points: number, phase: ClockPhase = 'approach'): number {
  requireNonNegativeFinite(points, 'Points');
  requirePhase(phase);
  const eligiblePoints = phaseEventPoints(points, phase);
  if (eligiblePoints === 0) return 0;
  return 100 * -Math.expm1((-Math.LN2 * eligiblePoints) / phaseHalfwayPoints(phase));
}

export function calculateMovementSeconds(
  priorPoints: number,
  eventPoints: number,
  phase: ClockPhase = 'approach',
): number {
  requireNonNegativeFinite(priorPoints, 'Prior points');
  requireNonNegativeFinite(eventPoints, 'Event points');
  requirePhase(phase);
  const eligiblePoints = phaseEventPoints(eventPoints, phase);
  if (eligiblePoints === 0) return 0;
  const gapFraction = calculateGapClosedPercent(eligiblePoints, phase) / 100;
  const priorRemaining = calculateClock(priorPoints, phase).remainingSeconds;
  const activeWindow = phase === 'approach' ? priorRemaining - CALIBRATION.horizonSeconds : priorRemaining;
  const representedMovement = activeWindow * gapFraction;
  return representedMovement > 0 ? representedMovement : Number.MIN_VALUE;
}

function requirePercent(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be a finite number between 0 and 100`);
  }
}

export function formatGapClosedPercent(percent: number): string {
  requirePercent(percent, 'Gap closed percent');
  return percent === 0 ? '0%' : `${percent.toFixed(2)}%`;
}

export function formatPressure(pressure: number): string {
  requirePercent(pressure, 'Pressure');
  return pressure >= 99.95 ? '<100' : pressure.toFixed(1);
}

export function formatTime(seconds: number): string {
  requireNonNegativeFinite(seconds, 'Seconds');
  if (seconds < 1) return '<00:01';
  if (seconds > CALIBRATION.horizonSeconds && seconds < CALIBRATION.horizonSeconds + 0.5) return '>02:00';
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

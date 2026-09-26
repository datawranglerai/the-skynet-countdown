export const CALIBRATION = Object.freeze({
  version: '2.0' as const,
  effectiveDate: '2026-09-26' as const,
  halfwayPoints: 100,
  startingSeconds: 3600,
});

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
}

export function effectivePoints(score: number, fullTrifecta: boolean): number {
  requireNonNegativeFinite(score, 'Score');
  if (!Number.isSafeInteger(score)) {
    throw new RangeError('Score must be a non-negative safe integer');
  }
  return fullTrifecta ? Math.max(7, score) : score;
}

export function calculateClock(points: number): { remainingSeconds: number; pressure: number } {
  requireNonNegativeFinite(points, 'Points');
  const remainingSeconds = CALIBRATION.startingSeconds / (1 + points / CALIBRATION.halfwayPoints);
  return {
    remainingSeconds,
    pressure: 100 * (1 - remainingSeconds / CALIBRATION.startingSeconds),
  };
}

export function formatTime(seconds: number): string {
  requireNonNegativeFinite(seconds, 'Seconds');
  if (seconds < 1) return '<00:01';
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

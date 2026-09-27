export const CALIBRATION = Object.freeze({
  version: '1.0' as const,
  effectiveDate: '2026-09-27' as const,
  halfwayPoints: 100,
  startingSeconds: 3600,
});

function requireNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
}

export function calculateClock(points: number): { remainingSeconds: number; pressure: number } {
  requireNonNegativeFinite(points, 'Points');
  const exponent = (-Math.LN2 * points) / CALIBRATION.halfwayPoints;
  const remainingSeconds = Math.max(
    Number.MIN_VALUE,
    CALIBRATION.startingSeconds * Math.exp(exponent),
  );
  return {
    remainingSeconds,
    pressure: calculateGapClosedPercent(points),
  };
}

export function calculateGapClosedPercent(points: number): number {
  requireNonNegativeFinite(points, 'Points');
  if (points === 0) return 0;
  return 100 * -Math.expm1((-Math.LN2 * points) / CALIBRATION.halfwayPoints);
}

export function calculateMovementSeconds(priorPoints: number, eventPoints: number): number {
  requireNonNegativeFinite(priorPoints, 'Prior points');
  requireNonNegativeFinite(eventPoints, 'Event points');
  if (eventPoints === 0) return 0;
  const gapFraction = -Math.expm1(
    (-Math.LN2 * eventPoints) / CALIBRATION.halfwayPoints,
  );
  const representedMovement = calculateClock(priorPoints).remainingSeconds * gapFraction;
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
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

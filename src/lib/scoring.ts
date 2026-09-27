import type { RiskScore, RiskSeverity } from './types.ts';

export const MAX_SCORE = 17;
export const TRIFECTA_WEIGHTS: readonly [0, 1, 3, 7] = Object.freeze([0, 1, 3, 7]);

const TRIFECTA_KEYS = ['t1', 't2', 't3'] as const;
const AMPLIFIER_KEYS = ['governance', 'autonomy', 'erosion', 'sentience', 'physical'] as const;
const ALL_KEYS = [...TRIFECTA_KEYS, ...AMPLIFIER_KEYS] as const;

function severityFor(totalPoints: number): RiskSeverity {
  if (totalPoints === 0) return 'NO_MOVEMENT';
  if (totalPoints <= 2) return 'CANARY';
  if (totalPoints <= 4) return 'NOTABLE';
  if (totalPoints <= 6) return 'SIGNIFICANT';
  if (totalPoints <= 12) return 'CRITICAL';
  return 'EXISTENTIAL';
}

export function calculateRiskScore(scores: Record<string, number>): RiskScore {
  for (const key of Object.keys(scores)) {
    if (!ALL_KEYS.includes(key as (typeof ALL_KEYS)[number])) {
      throw new RangeError(`Unknown scoring component: ${key}`);
    }
  }
  for (const key of ALL_KEYS) {
    const value = scores[key];
    const maximum = TRIFECTA_KEYS.includes(key as (typeof TRIFECTA_KEYS)[number]) ? 1 : 2;
    if (!Number.isInteger(value) || value < 0 || value > maximum) {
      throw new RangeError(`${key} must be an integer between 0 and ${maximum}`);
    }
  }

  const trifectaCount = TRIFECTA_KEYS.reduce((sum, key) => sum + scores[key], 0);
  const trifectaPoints = TRIFECTA_WEIGHTS[trifectaCount];
  const amplifierPoints = AMPLIFIER_KEYS.reduce((sum, key) => sum + scores[key], 0);
  const totalPoints = trifectaPoints + amplifierPoints;
  return {
    trifectaCount,
    trifectaPoints,
    amplifierPoints,
    totalPoints,
    severity: severityFor(totalPoints),
  };
}

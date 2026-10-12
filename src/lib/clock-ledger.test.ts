import assert from 'node:assert/strict';
import test from 'node:test';
import { CALIBRATION, calculateClock, calculateGapClosedPercent, formatTime } from './calibration.ts';
import { applyClockLedger, type ClockLedgerEntry } from './clock-ledger.ts';
import type { EventHorizonApproval } from './types.ts';

const incidents: ClockLedgerEntry[] = [
  { id: 'alpha', date: '2026-01-01', score: 4 },
  { id: 'bravo', routeAliases: ['old-bravo'], date: '2026-01-02', score: 12 },
  { id: 'charlie', date: '2026-01-03', score: 9 },
  { id: 'delta', date: '2026-01-04', score: 10 },
];

const approval: EventHorizonApproval = {
  approvedBy: 'The editor',
  approvedAt: '2026-01-05T12:00:00.000Z',
  effectiveAfter: { date: '2026-01-02', incidentId: 'old-bravo' },
  rationale: 'Published evidence shows a material deterioration in meaningful human control.',
  editorialUrl: '#/reports/event-horizon-entry',
};

test('ordinary evidence cannot infer Event Horizon approval from scores or elapsed time', () => {
  const ledger = applyClockLedger(incidents, null);
  assert.equal(ledger.clock.phase, 'approach');
  assert.equal(ledger.clock.approval, null);
  assert.equal(ledger.clock.transition, null);
  assert.equal(ledger.clock.phasePoints, 35);
  assert.equal(ledger.totalPoints, 35);
  assert.ok(ledger.remainingSeconds > CALIBRATION.horizonSeconds);
  assert.ok(ledger.entries.every((entry) => entry.clockPhase === 'approach'));
});

test('approval resets the clock separately and applies the higher threshold per incident', () => {
  const ledger = applyClockLedger(incidents, approval);
  assert.equal(ledger.totalPoints, 35);
  assert.equal(ledger.clock.phase, 'event-horizon');
  assert.equal(ledger.clock.phasePoints, 10);
  assert.equal(ledger.clock.transition?.afterIncidentId, 'bravo');
  assert.equal(ledger.clock.transition?.remainingSecondsBefore, calculateClock(16).remainingSeconds);
  assert.equal(
    ledger.clock.transition?.adjustmentSeconds,
    calculateClock(16).remainingSeconds - CALIBRATION.horizonSeconds,
  );
  assert.deepEqual(ledger.entries.map((entry) => entry.clockPhase), [
    'approach', 'approach', 'event-horizon', 'event-horizon',
  ]);
  assert.deepEqual(ledger.entries.map((entry) => entry.effectivePoints), [4, 12, 0, 10]);
  assert.deepEqual(ledger.entries.map((entry) => entry.phaseCumulativePoints), [4, 16, 0, 10]);
  assert.deepEqual(ledger.entries.map((entry) => entry.cumulativePoints), [4, 16, 25, 35]);
  assert.equal(ledger.entries[2].remainingSeconds, CALIBRATION.horizonSeconds);
  assert.equal(ledger.entries[2].movementSeconds, 0);
  assert.equal(ledger.entries[2].gapClosedPercent, 0);
  assert.equal(ledger.entries[3].remainingSeconds, calculateClock(10, 'event-horizon').remainingSeconds);
  assert.ok(Math.abs(ledger.entries[3].movementSeconds - (CALIBRATION.horizonSeconds - ledger.remainingSeconds)) < 1e-12);
  assert.ok(ledger.entries[3].movementSeconds > 0);
});

test('several sub-threshold Event Horizon incidents never combine into eligible points', () => {
  const ledger = applyClockLedger([
    ...incidents.slice(0, 2),
    { id: 'c', date: '2026-01-03', score: 6 },
    { id: 'd', date: '2026-01-04', score: 6 },
  ], approval);
  assert.equal(ledger.totalPoints, 28);
  assert.equal(ledger.clock.phasePoints, 0);
  assert.equal(ledger.remainingSeconds, CALIBRATION.horizonSeconds);
  assert.deepEqual(ledger.entries.slice(2).map((entry) => entry.effectivePoints), [0, 0]);
});

test('an approval at the newest incident enters the Event Horizon with no incident charged for the transition', () => {
  const lastApproval = {
    ...approval,
    effectiveAfter: { date: '2026-01-04', incidentId: 'delta' },
  };
  const ledger = applyClockLedger(incidents, lastApproval);
  assert.equal(ledger.clock.phase, 'event-horizon');
  assert.equal(ledger.clock.phasePoints, 0);
  assert.equal(ledger.remainingSeconds, 120);
  assert.ok(ledger.clock.transition!.adjustmentSeconds > 0);
  assert.ok(ledger.entries.every((entry) => entry.clockPhase === 'approach'));
  assert.ok(Math.abs(
    ledger.entries.reduce((sum, entry) => sum + entry.movementSeconds, 0)
      - (CALIBRATION.startingSeconds - ledger.clock.transition!.remainingSecondsBefore),
  ) < 1e-12);
});

test('chronology is deterministic and an alias can preserve a frozen approval anchor', () => {
  const reversed = applyClockLedger([...incidents].reverse(), approval);
  const ordered = applyClockLedger(incidents, approval);
  assert.deepEqual(reversed, ordered);
  assert.deepEqual(reversed.entries.map((entry) => entry.id), ['alpha', 'bravo', 'charlie', 'delta']);
});

test('same-day cutover uses the frozen approval key when its alias now resolves to a renamed root', () => {
  const sameDay = [
    { id: 'alpha', date: '2026-01-01', score: 4 },
    { id: 'middle', date: '2026-01-02', score: 10 },
    { id: 'renamed-root', routeAliases: ['bravo'], date: '2026-01-02', score: 12 },
  ];
  const frozenApproval = { ...approval, effectiveAfter: { date: '2026-01-02', incidentId: 'bravo' } };
  const ledger = applyClockLedger(sameDay, frozenApproval);
  assert.deepEqual(
    Object.fromEntries(ledger.entries.map((entry) => [entry.id, entry.clockPhase])),
    { alpha: 'approach', middle: 'event-horizon', 'renamed-root': 'approach' },
  );
  assert.equal(ledger.clock.transition?.afterIncidentId, 'renamed-root');
});

test('approval metadata fails closed when missing, stale or unsafe', () => {
  assert.throws(
    () => applyClockLedger(incidents, { ...approval, effectiveAfter: { date: '2026-01-02', incidentId: 'missing' } }),
    /anchor missing is missing/,
  );
  assert.throws(
    () => applyClockLedger(incidents, { ...approval, effectiveAfter: { date: '2026-01-03', incidentId: 'bravo' } }),
    /anchor date changed/,
  );
  assert.throws(() => applyClockLedger(incidents, { ...approval, approvedBy: '' }), /approvedBy/);
  assert.throws(() => applyClockLedger(incidents, { ...approval, approvedAt: 'tomorrow' }), /approvedAt/);
  assert.throws(() => applyClockLedger(incidents, { ...approval, approvedAt: '2026-02-30T12:00:00Z' }), /approvedAt/);
  assert.throws(() => applyClockLedger(incidents, { ...approval, editorialUrl: 'javascript:alert(1)' }), /editorialUrl/);
  assert.throws(() => applyClockLedger(incidents, { ...approval, rationale: '' }), /rationale/);
  assert.throws(
    () => applyClockLedger([{ id: 'bad-date', date: '2026-02-30', score: 1 }]),
    /valid YYYY-MM-DD/,
  );
});

test('phase calculations preserve both asymptotes and the near-boundary display', () => {
  assert.ok(calculateClock(Number.MAX_VALUE, 'approach').remainingSeconds > 120);
  assert.ok(calculateClock(Number.MAX_VALUE, 'event-horizon').remainingSeconds > 0);
  assert.equal(formatTime(120.25), '>02:00');
  assert.equal(formatTime(120), '02:00');
  assert.equal(formatTime(0.5), '<00:01');
  assert.equal(calculateGapClosedPercent(9, 'event-horizon'), 0);
  assert.ok(calculateGapClosedPercent(10, 'event-horizon') > 0);
  assert.throws(() => calculateClock(1, 'invalid' as never), /Unknown clock phase/);
});

import { useMemo, useRef, useState } from 'react';
import { trackEvent } from '../analytics';
import robotPortrait from '../../assets/optimized/futuristic-robot-head.webp';
import robotPortraitLarge from '../../assets/optimized/futuristic-robot-head-large.webp';
import ImageCredit from '../components/ImageCredit';
import { Arrow, FRAMEWORK_REPOSITORY_URL } from '../components/Shared';
import { getDatasetExportUrl } from '../data';
import {
  CALIBRATION,
  calculateClock,
  calculateGapClosedPercent,
  calculateMovementSeconds,
  formatGapClosedPercent,
  formatTime,
} from '../lib/calibration';
import { CRITERIA } from '../lib/criteria';
import { MAX_SCORE, calculateRiskScore } from '../lib/scoring';
import type { ClockPhase, Dataset, Incident } from '../lib/types';
import './methodology.css';

interface MethodologyProps {
  dataset: Dataset;
}

type CalculatorScores = Record<string, number>;

const SEVERITY_BANDS = [
  { range: '0', label: 'NO MOVEMENT', note: 'Recorded for context; contributes no evidence points.' },
  { range: '1–2', label: 'CANARY', note: 'A noteworthy signal.' },
  { range: '3–4', label: 'NOTABLE', note: 'A concrete cause for concern.' },
  { range: '5–6', label: 'SIGNIFICANT', note: 'Meaningful proximity to loss of control.' },
  { range: '7–12', label: 'CRITICAL', note: 'A major step change; a full Trifecta starts here.' },
  { range: '13–17', label: 'EXISTENTIAL', note: 'Multiple Trifecta conditions combine with substantial amplifiers.' },
] as const;

const TRIFECTA_LADDER = [
  { conditions: 0, points: 0 },
  { conditions: 1, points: 1 },
  { conditions: 2, points: 3 },
  { conditions: 3, points: 7 },
] as const;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date.includes('T') ? date : `${date}T00:00:00Z`));

const formatMovement = (seconds: number) => {
  if (seconds <= 0) return 'No movement';
  if (seconds < 1) return '<1 second closer';
  return `${Math.round(seconds)} second${Math.round(seconds) === 1 ? '' : 's'} closer`;
};

const clockBoundaryLabel = (phase: ClockPhase) =>
  phase === 'approach' ? 'Event Horizon' : 'midnight';

const phaseLabel = (phase: ClockPhase) =>
  phase === 'approach' ? 'Approach' : 'After Event Horizon';

function ExampleInspector({ incidents }: { incidents: Incident[] }) {
  const exampleIds = useMemo(() => {
    const zero = incidents.find((incident) => incident.scoring.totalPoints === 0);
    const trifecta = incidents.find((incident) => incident.scoring.trifectaCount === 3);
    const highest = incidents.reduce<Incident | undefined>(
      (best, incident) => (!best || incident.scoring.totalPoints > best.scoring.totalPoints ? incident : best),
      undefined,
    );
    return [...new Set([zero?.id, trifecta?.id, highest?.id].filter(Boolean) as string[])];
  }, [incidents]);

  const initialId = exampleIds[0] ?? incidents[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(initialId);
  const incident = incidents.find((item) => item.id === selectedId) ?? incidents[0];
  const selectExample = (id: string) => {
    setSelectedId(id);
    trackEvent('methodology/worked-example', 'Select a worked example');
  };

  if (!incident) return <p className="method-empty">No assessments are available.</p>;

  return (
    <div className="method-example">
      <div className="method-example-picker">
        <label htmlFor="worked-example">Choose an assessed incident</label>
        <select
          id="worked-example"
          value={incident.id}
          onChange={(event) => selectExample(event.target.value)}
        >
          {incidents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.scoring.totalPoints}/{MAX_SCORE} · {item.headline}
            </option>
          ))}
        </select>
        {exampleIds.length > 1 && (
          <div className="method-example-shortcuts" aria-label="Suggested examples">
            {exampleIds.map((id, index) => (
              <button
                className={incident.id === id ? 'is-active' : ''}
                key={id}
                type="button"
                onClick={() => selectExample(id)}
              >
                Example {String(index + 1).padStart(2, '0')}
              </button>
            ))}
          </div>
        )}
      </div>

      <article className="method-example-report" aria-live="polite">
        <header>
          <div>
            <p className="eyebrow">Worked example · {formatDate(incident.assessment.date)}</p>
            <h3>{incident.headline}</h3>
          </div>
          <div className="method-score-stamp" aria-label={`${incident.scoring.totalPoints} out of ${MAX_SCORE}, ${incident.scoring.totalPoints === 0 ? 'no movement' : incident.scoring.severity}`}>
            <strong>{incident.scoring.totalPoints}</strong><span>/{MAX_SCORE}</span>
            <small>{incident.scoring.totalPoints === 0 ? 'NO MOVEMENT' : incident.scoring.severity}</small>
          </div>
        </header>

        <div className="method-example-result">
          <div className="method-example-impact"><span>Gap to {clockBoundaryLabel(incident.clockPhase)} closed</span><strong>{formatGapClosedPercent(incident.gapClosedPercent)}</strong></div>
          <div><span>Trifecta points</span><strong>{incident.scoring.trifectaPoints} / 7</strong></div>
          <div><span>Amplifier points</span><strong>{incident.scoring.amplifierPoints} / 10</strong></div>
          <div><span>Time change at this position</span><strong>{formatMovement(incident.movementSeconds)}</strong></div>
          <div><span>Position after event</span><strong>{formatTime(incident.remainingSeconds)}</strong></div>
        </div>

        <p className="method-example-phase">
          <strong>{phaseLabel(incident.clockPhase)} rules.</strong>{' '}
          {incident.clockPhase === 'event-horizon' && incident.effectivePoints === 0
            ? `This ${incident.scoring.totalPoints}/${MAX_SCORE} incident remains visible, but does not meet the ${CALIBRATION.eventHorizonMinimumScore}-point movement threshold.`
            : `${incident.effectivePoints} evidence point${incident.effectivePoints === 1 ? '' : 's'} counted toward this phase.`}
        </p>

        {incident.scoring.trifectaCount === 3 && (
          <p className="method-trifecta-note">
            Full Trifecta: the three conditions contribute seven points before amplifiers. This event adds {incident.scoring.amplifierPoints} amplifier point{incident.scoring.amplifierPoints === 1 ? '' : 's'}, for {incident.scoring.totalPoints}/{MAX_SCORE} overall and a {incident.scoring.severity} classification.
          </p>
        )}

        <div className="method-example-grid">
          {CRITERIA.map((criterion) => {
            const score = incident.assessment.scores[criterion.key] ?? 0;
            return (
              <section key={criterion.key} className="method-example-criterion">
                <div className="method-criterion-line">
                  <span>{criterion.shortLabel}</span>
                  <strong>{score}/{criterion.max}</strong>
                </div>
                <meter min="0" max={criterion.max} value={score} aria-label={`${criterion.label}: ${score} out of ${criterion.max}`} />
                <p>{incident.assessment.rationales[criterion.key] || 'No rationale supplied.'}</p>
              </section>
            );
          })}
        </div>

        {(incident.assessment.notes || incident.assessment.leadingNote) && (
          <div className="method-assessor-note">
            <strong>Assessment workflow note</strong>
            <p>{incident.assessment.leadingNote || incident.assessment.notes}</p>
          </div>
        )}

        <footer>
          <a className="text-link" href={`#/incidents/${incident.id}`}>Read the incident report</a>
          <a className="text-link" href={incident.assessment.sourceUrl} target="_blank" rel="noreferrer">Open original source</a>
        </footer>
      </article>
    </div>
  );
}

function IncidentCalculator({ dataset }: { dataset: Dataset }) {
  const initialScores = Object.fromEntries(CRITERIA.map(({ key }) => [key, 0]));
  const [scores, setScores] = useState<CalculatorScores>(initialScores);
  const used = useRef(false);
  const [previewPhase, setPreviewPhase] = useState<ClockPhase>(dataset.clock.phase);
  const scoring = calculateRiskScore(scores);
  const previewPhasePoints = previewPhase === dataset.clock.phase ? dataset.clock.phasePoints : 0;
  const effectivePreviewPoints = previewPhase === 'event-horizon'
    && scoring.totalPoints < CALIBRATION.eventHorizonMinimumScore
    ? 0
    : scoring.totalPoints;
  const { remainingSeconds: projectedSeconds } = calculateClock(
    previewPhasePoints + effectivePreviewPoints,
    previewPhase,
  );
  const movementSeconds = calculateMovementSeconds(
    previewPhasePoints,
    effectivePreviewPoints,
    previewPhase,
  );
  const gapClosedPercent = calculateGapClosedPercent(effectivePreviewPoints, previewPhase);
  const severityLabel = scoring.totalPoints === 0 ? 'NO MOVEMENT' : scoring.severity;

  const markUsed = () => {
    if (used.current) return;
    used.current = true;
    trackEvent('calculator/use', 'Use the hypothetical incident calculator');
  };

  const updateScore = (key: string, value: number) => {
    markUsed();
    setScores((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="method-calculator">
      <form className="method-controls" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="method-phase-control">
          <legend>Clock phase</legend>
          <p>Compare how the two clock phases handle the same score. This preview leaves the live clock unchanged.</p>
          <div>
            {(['approach', 'event-horizon'] as const).map((phase) => (
              <label key={phase}>
                <input
                  type="radio"
                  name="calculator-clock-phase"
                  checked={previewPhase === phase}
                  onChange={() => {
                    markUsed();
                    setPreviewPhase(phase);
                    trackEvent(`calculator/phase/${phase}`, `Calculator phase: ${phaseLabel(phase)}`);
                  }}
                />
                <span>{phaseLabel(phase)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="method-control-group">
          <p className="eyebrow">01 · Trifecta</p>
          {CRITERIA.filter(({ tier }) => tier === 'trifecta').map((criterion) => (
            <label className="method-toggle" key={criterion.key}>
              <input
                type="checkbox"
                checked={scores[criterion.key] === 1}
                onChange={(event) => updateScore(criterion.key, event.target.checked ? 1 : 0)}
              />
              <span aria-hidden="true" />
              <b>{criterion.shortLabel}</b>
              <small>{criterion.description}</small>
            </label>
          ))}
        </div>

        <div className="method-control-group">
          <p className="eyebrow">02 · Amplifiers</p>
          {CRITERIA.filter(({ tier }) => tier === 'amplifier').map((criterion) => (
            <fieldset className="method-stepper" key={criterion.key}>
              <legend>{criterion.shortLabel}</legend>
              <p>{criterion.description}</p>
              <div>
                {[0, 1, 2].map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={`calculator-${criterion.key}`}
                      value={value}
                      aria-label={`${criterion.label}: ${criterion.scoreDescriptions?.[value] ?? (value === 0 ? 'absent' : value === 1 ? 'present' : 'significantly present')}`}
                      checked={scores[criterion.key] === value}
                      onChange={() => updateScore(criterion.key, value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </form>

      <aside className="method-calculator-output" aria-live="polite">
        <p className="eyebrow">Hypothetical result</p>
        <div className="method-projected-time">{formatGapClosedPercent(gapClosedPercent)}</div>
        <p className="method-output-label">of the remaining gap to {clockBoundaryLabel(previewPhase)} closed</p>

        <dl>
          <div><dt>Trifecta conditions</dt><dd>{scoring.trifectaCount} / 3</dd></div>
          <div><dt>Trifecta points</dt><dd>{scoring.trifectaPoints} / 7</dd></div>
          <div><dt>Amplifier points</dt><dd>{scoring.amplifierPoints} / 10</dd></div>
          <div><dt>Total score</dt><dd>{scoring.totalPoints} / {MAX_SCORE}</dd></div>
          <div className="method-calculator-severity"><dt>Classification</dt><dd>{severityLabel}</dd></div>
          <div><dt>Preview phase</dt><dd>{phaseLabel(previewPhase)}</dd></div>
          <div><dt>Points already in this phase</dt><dd>{previewPhasePoints} pts</dd></div>
          <div><dt>Projected clock</dt><dd>{formatTime(projectedSeconds)}</dd></div>
          <div><dt>Time change here</dt><dd>{formatMovement(movementSeconds)}</dd></div>
        </dl>

        {scoring.trifectaCount === 3 && (
          <p className="method-output-alert">The full Trifecta contributes seven points and guarantees at least CRITICAL. Amplifier points remain additive and can raise the result to EXISTENTIAL.</p>
        )}
        {scoring.totalPoints === 0 && (
          <p className="method-output-zero">Zero-score incident: recorded, with no clock movement.</p>
        )}
        {previewPhase === 'event-horizon' && scoring.totalPoints > 0 && effectivePreviewPoints === 0 && (
          <p className="method-output-zero">Recorded and still visible, but scores below {CALIBRATION.eventHorizonMinimumScore}/{MAX_SCORE} do not move the clock after Event Horizon.</p>
        )}
        <p className="method-preview-note">Local preview only. It does not change the live clock or the published Event Horizon decision.</p>
        <button type="button" className="button" onClick={() => {
          setScores(initialScores);
          trackEvent('calculator/reset', 'Reset calculator controls');
        }}>Reset controls</button>
      </aside>
    </div>
  );
}

export default function Methodology({ dataset }: MethodologyProps) {
  const assessmentsUrl = getDatasetExportUrl('assessments');
  const storiesUrl = getDatasetExportUrl('stories');
  return (
    <div className="method-page" data-analytics-area="methodology">
      <section className="method-hero container" aria-labelledby="method-title">
        <div className="method-hero-heading">
          <p className="eyebrow">Methodology · v{CALIBRATION.version}</p>
          <h1 id="method-title">Show your<br />working<span>.</span></h1>
        </div>
        <figure className="method-reference">
          <img
            src={robotPortrait}
            srcSet={`${robotPortrait} 680w, ${robotPortraitLarge} 1280w`}
            sizes="(max-width: 600px) 100vw, (max-width: 900px) 75vw, (min-width: 1440px) 680px, 54vw"
            alt=""
            width="680"
            height="850"
            decoding="async"
          />
          <ImageCredit filename="Futuristic Robot Head.jpg" />
        </figure>
        <div className="method-hero-copy">
          <p className="method-deck">The Skynet Countdown tracks AI developments that put meaningful human control at risk. We choose which incidents to include and publish the reasons behind each score.</p>
          <p>We score each incident against eight published criteria. The formula converts accumulated qualifying points into symbolic minutes to midnight.</p>
          <p>The scale is an editorial choice. The clock tracks recorded evidence; it does not forecast when anything will happen.</p>
          <p>We publish the criteria, rationales and sources so you can check a score or challenge it.</p>
        </div>
      </section>

      <section className="method-score-section container" aria-labelledby="scoring-title">
        <div className="section-heading">
          <p className="eyebrow">01 · Assessment</p>
          <h2 id="scoring-title">How incidents are scored.</h2>
          <p>Score what happened, not the most dramatic thing that could happen next.</p>
        </div>

        <div className="method-tiers">
          <section className="method-tier method-tier-trifecta">
            <header><span>Tier 01</span><strong>0–7 points</strong></header>
            <h3>The Lethal Trifecta</h3>
            <p>Each condition is binary and needs direct evidence. We weight combinations more heavily because access, hostile input and permission to act externally pose more risk together than their individual scores suggest.</p>
            <div className="method-criteria-list">
              {CRITERIA.filter(({ tier }) => tier === 'trifecta').map((criterion) => (
                <article key={criterion.key}>
                  <b>{criterion.shortLabel}</b>
                  <div><h4>{criterion.label}</h4><p>{criterion.description}</p></div>
                  <span>0 / 1</span>
                </article>
              ))}
            </div>
            <div className="method-trifecta-ladder" aria-label="Trifecta scoring ladder">
              {TRIFECTA_LADDER.map((step) => (
                <div key={step.conditions}><span>{step.conditions} condition{step.conditions === 1 ? '' : 's'}</span><strong>{step.points} point{step.points === 1 ? '' : 's'}</strong></div>
              ))}
            </div>
            <p className="method-rule"><strong>Combination rule:</strong> all three conditions contribute seven points and guarantee at least CRITICAL. Amplifiers are then added on top.</p>
          </section>

          <section className="method-tier method-tier-amplifiers">
            <header><span>Tier 02</span><strong>0–10 points</strong></header>
            <h3>Risk amplifiers</h3>
            <p>These five criteria capture broader risks. Each scores 0 (absent), 1 (present) or 2 (significantly present). Add their points to the Trifecta score.</p>
            <div className="method-criteria-list">
              {CRITERIA.filter(({ tier }) => tier === 'amplifier').map((criterion) => (
                <article key={criterion.key}>
                  <b>{criterion.shortLabel}</b>
                  <div>
                    <h4>{criterion.label}</h4><p>{criterion.description}</p>
                    {criterion.scoreDescriptions && (
                      <ol className="method-score-rubric" aria-label={`${criterion.label} scoring rubric`}>
                        {criterion.scoreDescriptions.map((description, value) => <li key={description}><strong>{value}</strong><span>{description}</span></li>)}
                      </ol>
                    )}
                  </div>
                  <span>0 / 2</span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <p className="method-score-total"><span>Maximum published score</span><strong>{MAX_SCORE}</strong><span>7 Trifecta + 10 amplifier points</span></p>

        <div className="method-bands" aria-label="Score classification bands">
          {SEVERITY_BANDS.map((band) => (
            <article key={band.range}>
              <strong>{band.range}</strong>
              <span>{band.label}</span>
              <p>{band.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="method-formula-section" aria-labelledby="formula-title">
        <div className="container method-formula-layout">
          <div className="section-heading">
            <p className="eyebrow">02 · Calibration</p>
            <h2 id="formula-title">Within each phase, the same score closes the same share.</h2>
            <div className="method-calibration-intro">
              <p>The clock starts at {CALIBRATION.startingSeconds / 60} symbolic minutes to midnight, the reading <a href="https://www.imd.org/ibyimd/artificial-intelligence/imd-ai-safety-clock-moves-to-15-minutes-to-midnight/">IMD's AI Safety Clock</a> published in September 2026. We chose an independent, dated assessment that readers can check. It is still an editorial judgement.</p>
              <p>After that starting point, our own assessments and formula determine every movement. The clock does not stay synchronised with IMD’s.</p>
            </div>
          </div>
          <div className="method-formula-card">
            <p className="method-formula">
              <i>T<sub>A</sub>(B) =</i>
              <span><b>{CALIBRATION.horizonSeconds} + {CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds} × 2</b><sup>−B / {CALIBRATION.halfwayPoints}</sup></span>
            </p>
            <dl>
              <div><dt>T₀</dt><dd>The editorial starting window: {formatTime(CALIBRATION.startingSeconds)} symbolic minutes ({CALIBRATION.startingSeconds.toLocaleString('en-GB')} seconds)</dd></div>
              <div><dt>B</dt><dd>Cumulative evidence points across distinct events</dd></div>
              <div><dt>H</dt><dd>The editorial half-scale, fixed at {CALIBRATION.halfwayPoints.toLocaleString('en-GB')} evidence points</dd></div>
              <div><dt>T<sub>A</sub>(B)</dt><dd>Symbolic seconds remaining during the Approach phase</dd></div>
            </dl>
          </div>
          <div className="method-formula-copy">
            <p>
              Every {CALIBRATION.halfwayPoints.toLocaleString('en-GB')} evidence points halves the gap between the hand and Event Horizon: {formatTime(CALIBRATION.startingSeconds)} becomes {formatTime(CALIBRATION.horizonSeconds + (CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds) / 2)}, then {formatTime(CALIBRATION.horizonSeconds + (CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds) / 4)}. This fixed editorial constant sets the clock’s sensitivity during the Approach phase. It is not a probability or a scientifically estimated risk parameter.
            </p>
            <p>
              An incident with score <strong>s</strong> closes <strong>1 − 2<sup>−s/{CALIBRATION.halfwayPoints}</sup></strong> of the remaining gap to Event Horizon. That share stays the same throughout this phase: a two-point event always closes {formatGapClosedPercent(calculateGapClosedPercent(2, 'approach'))}; a {MAX_SCORE}-point event always closes {formatGapClosedPercent(calculateGapClosedPercent(MAX_SCORE, 'approach'))}. The number of seconds also depends on the clock’s position, so it cannot be used on its own to compare severity.
            </p>
            <p>
              During the Approach, the curve gets closer to {formatTime(CALIBRATION.horizonSeconds)} without reaching it. Each qualifying incident moves the hand without queuing, by fewer seconds as the gap narrows. There is no passive ticking, decay or recovery model. Corrections to scores or event grouping can change past positions. The chart uses database record dates, which may be publication or disclosure dates rather than the dates the events occurred.
            </p>
          </div>
          <div className="method-impact-comparison" aria-label="Examples of persistent incident impact during the Approach phase">
            <div><span>Total score</span><strong>2</strong><b>{formatGapClosedPercent(calculateGapClosedPercent(2, 'approach'))}</b><small>of gap to Event Horizon</small></div>
            <div><span>Total score</span><strong>{MAX_SCORE}</strong><b>{formatGapClosedPercent(calculateGapClosedPercent(MAX_SCORE, 'approach'))}</b><small>of gap to Event Horizon</small></div>
          </div>
          <aside className="method-baseline-note" aria-label="Starting point and attribution">
            <p><strong>An editorial starting point.</strong> The {CALIBRATION.startingSeconds / 60}-minute window is our choice for communicating urgency. Midnight represents loss of meaningful human control over AI. Event Horizon marks the clock’s final phase.</p>
            <p>Our starting window takes inspiration from the <a href="https://www.imd.org/centers/digital-ai-transformation-center/aisafetyclock/">IMD AI Safety Clock</a> and its <a href="https://www.imd.org/ibyimd/artificial-intelligence/imd-ai-safety-clock-moves-to-15-minutes-to-midnight/">16 September 2026 assessment</a>. Our historical ledger and formula remain our own. The projects are unaffiliated, and their readings are not directly comparable.</p>
          </aside>
        </div>
      </section>

      <section id="event-horizon" tabIndex={-1} className="container method-horizon-section" aria-labelledby="event-horizon-title">
        <div className="method-horizon-heading">
          <p className="eyebrow">03 · Phase boundary</p>
          <p className="method-horizon-time">{formatTime(CALIBRATION.horizonSeconds)}</p>
          <h2 id="event-horizon-title">Event Horizon<span>.</span></h2>
          <p className={`method-horizon-status ${dataset.clock.approval ? 'is-active' : ''}`}>
            <span aria-hidden="true" />
            {dataset.clock.approval ? 'Entered by explicit human decision' : 'Not entered · human decision required'}
          </p>
        </div>

        <div className="method-horizon-copy">
          <p className="method-horizon-deck">Event Horizon is the final two symbolic minutes. We use it to mark the point of no return: our judgement that meaningful human control has materially deteriorated.</p>
          <p>The name is deliberately dramatic. It expresses an editorial judgement, not scientific proof that catastrophe is inevitable. We chose two minutes as the final interval on a fifteen-minute clock; the number does not come from a risk model.</p>
          <p>Intervention may still buy time after entry. It does not reverse the crossing.</p>
          <p>The Approach formula gets closer to {formatTime(CALIBRATION.horizonSeconds)} without crossing it. The project owner must explicitly approve entry and publish the evidence and reasoning. Until then, each incident closes a fixed share of the remaining gap. Incidents do not wait in a queue at the boundary.</p>

          {dataset.clock.approval ? (
            <aside className="method-horizon-decision" aria-label="Event Horizon decision record">
              <p className="eyebrow">Decision record</p>
              <dl>
                <div><dt>Approved by</dt><dd>{dataset.clock.approval.approvedBy}</dd></div>
                <div><dt>Approved</dt><dd>{formatDate(dataset.clock.approval.approvedAt)}</dd></div>
                <div><dt>Effective after</dt><dd>{formatDate(dataset.clock.approval.effectiveAfter.date)} · {dataset.clock.approval.effectiveAfter.incidentId}</dd></div>
              </dl>
              <p>{dataset.clock.approval.rationale}</p>
              {dataset.clock.transition && (
                <p className="method-horizon-adjustment">The boundary crossing included a separately recorded editorial adjustment of {dataset.clock.transition.adjustmentSeconds.toFixed(2)} symbolic seconds after {dataset.clock.transition.afterIncidentId}. It is not attributed to that incident.</p>
              )}
              <a className="text-link" href={dataset.clock.approval.editorialUrl}>Read the decision editorial</a>
            </aside>
          ) : (
            <aside className="method-horizon-decision" aria-label="Event Horizon approval status">
              <p className="eyebrow">Current status</p>
              <strong>The Event Horizon rules are published, but inactive.</strong>
              <p>The live clock remains in the Approach phase. This status can change only through an explicit, dated decision and accompanying editorial.</p>
            </aside>
          )}
        </div>

        <div className="method-horizon-rules" aria-label="Clock rules after Event Horizon">
          <article>
            <span>01</span>
            <h3>Ten points to move</h3>
            <p>All incidents remain scored, published and visible. Only incidents scoring at least {CALIBRATION.eventHorizonMinimumScore}/{MAX_SCORE} move the clock in this phase. Classification bands do not change: CRITICAL still begins at 7.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Faster clock movement</h3>
            <p>The qualifying score closes a share of the remaining gap to midnight using a {CALIBRATION.eventHorizonHalfwayPoints}-point half-scale. At the boundary, a 10-point incident moves the hand about {calculateMovementSeconds(0, 10, 'event-horizon').toFixed(2)} seconds; a {MAX_SCORE}-point incident about {calculateMovementSeconds(0, MAX_SCORE, 'event-horizon').toFixed(2)} seconds.</p>
          </article>
          <article>
            <span>03</span>
            <h3>The formula never reaches midnight</h3>
            <p>After entry, T(E) = {CALIBRATION.horizonSeconds} × 2<sup>−E/{CALIBRATION.eventHorizonHalfwayPoints}</sup>, where E is the cumulative eligible evidence recorded since entry. Qualifying incidents can bring the hand indefinitely close to midnight, but the formula never declares that loss of control has occurred.</p>
          </article>
          <article>
            <span>04</span>
            <h3>A separate entry adjustment</h3>
            <p>Any editorial adjustment used to cross the boundary is recorded separately from incident movement. Earlier incidents are not rescored under the faster formula, and corrections or event regrouping remain possible.</p>
          </article>
        </div>

        <div className="method-horizon-impact" aria-label="Examples of incident impact after Event Horizon">
          <p><span>10 / {MAX_SCORE}</span><strong>{formatGapClosedPercent(calculateGapClosedPercent(10, 'event-horizon'))}</strong><small>of gap to midnight · eligible</small></p>
          <p><span>{MAX_SCORE} / {MAX_SCORE}</span><strong>{formatGapClosedPercent(calculateGapClosedPercent(MAX_SCORE, 'event-horizon'))}</strong><small>of gap to midnight · eligible</small></p>
        </div>
      </section>

      <section className="container method-examples-section" aria-labelledby="examples-title">
        <div className="section-heading">
          <p className="eyebrow">04 · Evidence</p>
          <h2 id="examples-title">Inspect a worked assessment.</h2>
          <p>Choose an incident to see the reasons for its score, the share of the gap it closed and the seconds it moved the clock at that position.</p>
        </div>
        <ExampleInspector incidents={dataset.incidents} />
      </section>

      <section className="method-calculator-section" aria-labelledby="calculator-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">05 · Calculator</p>
            <h2 id="calculator-title">Try a hypothetical incident.</h2>
            <p>Set the eight criteria to see the score and resulting clock movement.</p>
          </div>
          <IncidentCalculator dataset={dataset} />
        </div>
      </section>

      <section className="container method-open-source" aria-labelledby="open-method-title">
        <div className="method-open-source-panel">
          <div className="method-open-source-heading">
            <p className="eyebrow">06 · Open method</p>
            <h2 id="open-method-title">The method is open<span>.</span></h2>
          </div>
          <div className="method-open-source-copy">
            <p>The public repository documents the method used here: eight criteria, the Trifecta scoring table, amplifier scoring guides and the clock formula. You can adapt it for your own incident log, deployment decisions or governance failures.</p>
            <p>Change what doesn't fit. Use the repository to propose changes or challenge a score on this site.</p>
            <div className="method-open-source-actions">
              <a className="button button-outline" href={FRAMEWORK_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" aria-label="Read the method on GitHub (opens in a new tab)">Read the method on GitHub <Arrow diagonal /></a>
              <a className="text-link" href={`${FRAMEWORK_REPOSITORY_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" aria-label="Propose a change on GitHub (opens in a new tab)">Propose a change <Arrow diagonal /></a>
            </div>
            <p className="method-open-source-status"><strong>In development</strong> · The implementation is catching up with this site's methodology.</p>
          </div>
        </div>
      </section>

      <section className="container method-provenance" aria-labelledby="provenance-title">
        <div className="section-heading">
          <p className="eyebrow">07 · Provenance</p>
          <h2 id="provenance-title">How records are produced.</h2>
        </div>
        <ol className="method-pipeline">
          <li><span>01</span><strong>Scan</strong><p>Discovery starts with twenty-one AI and technology subreddits, plus manually supplied links.</p></li>
          <li><span>02</span><strong>Research</strong><p>The workflow reads the original sources behind qualifying developments.</p></li>
          <li><span>03</span><strong>Assess</strong><p>AI scores each incident against the eight criteria and gives a reason for each score.</p></li>
          <li><span>04</span><strong>Edit</strong><p>The workflow writes the factual account and analysis as separate parts of each report.</p></li>
        </ol>

        <div className="method-audit-grid">
          <article>
            <p className="eyebrow">Current data release</p>
            <strong>{dataset.incidents.length}</strong><span>unique events</span>
            <p>{dataset.assessmentCount} assessments · {dataset.editorialCount} reports covering {dataset.incidents.filter((item) => item.editorial).length} events · {dataset.incidents.filter((item) => !item.editorial).length} assessment-only events · {dataset.incidents.filter((item) => item.scoring.trifectaCount === 3).length} full-Trifecta events.</p>
          </article>
          <article>
            <h3>How records are grouped</h3>
            <p>
              Each incident page shows the current assessment and report. Earlier versions stay in the downloads. A grouped event counts once towards the clock, using the score from its selected assessment version.
            </p>
            <p>
              AI compares factual records from different sources. Matches are grouped automatically only when confidence is high and evidence and date checks pass. Uncertain matches need human review. Every grouping is logged and can be reversed. Permanent event IDs identify the public records; older CVE labels are kept as source references.
            </p>
          </article>
          <article>
            <h3>Download the records</h3>
            <p>The downloads preserve assessment and report versions, with links to events and sources. Their total scores, classifications, clock readings and timings record what the workflow produced. The site calculates its published 0–{MAX_SCORE} scores and clock from the individual criterion values. New records appear as the live dataset updates.</p>
            <div className="method-downloads">
              <a className="button button-primary" href={assessmentsUrl} download>Assessment CSV</a>
              <a className="button" href={storiesUrl} download>Editorial CSV</a>
            </div>
            <p className="method-updated">Dataset current to {formatDate(dataset.dataUpdatedAt ?? dataset.lastUpdated)}.</p>
          </article>
        </div>
      </section>

      <section className="method-limitations" aria-labelledby="limitations-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">08 · Read before panicking</p>
            <h2 id="limitations-title">What this index cannot tell you.</h2>
          </div>
          <div className="method-limitations-grid">
            <p><strong>Coverage changes the reading.</strong> More reporting or a wider source list can add evidence points without an equivalent change in underlying risk. Identity checks help avoid double counting, but automated matching can miss duplicates or group separate developments incorrectly.</p>
            <p><strong>It cannot determine loss of control.</strong> The clock is an editorial judgement based on selected evidence. It does not measure actual human control, extinction risk or time remaining.</p>
            <p><strong>The records are automated.</strong> The assessments and reports come from an AI workflow and have not been independently fact-checked. Check the original source before relying on a claim.</p>
            <p><strong>Judgement remains.</strong> The criteria let you inspect the reasoning behind a score, but they cannot settle disagreements. Scores depend on interpretation, and the framework tends to underweight early governance signals.</p>
            <p><strong>No recovery credit.</strong> The index awards no negative scores or credit for improvements. Corrections to scores or event grouping can change the recalculated clock in either direction.</p>
          </div>
          <p className="method-closing">The method is public so you can check the reasoning behind our judgements.</p>
        </div>
      </section>
    </div>
  );
}

import { useMemo, useState } from 'react';
import assessmentsUrl from '../../data/Skynet Countdown Log - assessments.csv?url';
import storiesUrl from '../../data/Skynet Countdown Log - stories.csv?url';
import terminatorPortrait from '../../assets/terminator-1-no-bg.png';
import { CALIBRATION, CRITERIA, calculateClock, effectivePoints as calculateEffectivePoints, formatTime } from '../lib/index';
import type { Dataset, Incident } from '../lib/types';
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
  { range: '7–9', label: 'CRITICAL', note: 'A major step change.' },
  { range: '10–13', label: 'EXISTENTIAL', note: 'Several high-risk dimensions coincide.' },
] as const;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

const formatMovement = (seconds: number) => {
  if (seconds <= 0) return 'No movement';
  if (seconds < 1) return '<1 second closer';
  return `${Math.round(seconds)} second${Math.round(seconds) === 1 ? '' : 's'} closer`;
};

function ExampleInspector({ incidents }: { incidents: Incident[] }) {
  const exampleIds = useMemo(() => {
    const zero = incidents.find((incident) => incident.assessment.score === 0);
    const trifecta = incidents.find((incident) => incident.assessment.fullTrifecta);
    const highest = incidents.reduce<Incident | undefined>(
      (best, incident) => (!best || incident.assessment.score > best.assessment.score ? incident : best),
      undefined,
    );
    return [...new Set([zero?.id, trifecta?.id, highest?.id].filter(Boolean) as string[])];
  }, [incidents]);

  const initialId = exampleIds[0] ?? incidents[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(initialId);
  const incident = incidents.find((item) => item.id === selectedId) ?? incidents[0];

  if (!incident) return <p className="method-empty">No assessments are available.</p>;

  return (
    <div className="method-example">
      <div className="method-example-picker">
        <label htmlFor="worked-example">Choose an assessed incident</label>
        <select
          id="worked-example"
          value={incident.id}
          onChange={(event) => setSelectedId(event.target.value)}
        >
          {incidents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.assessment.score}/13 · {item.headline}
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
                onClick={() => setSelectedId(id)}
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
          <div className="method-score-stamp" aria-label={`${incident.assessment.score} out of 13, ${incident.assessment.severity}`}>
            <strong>{incident.assessment.score}</strong><span>/13</span>
            <small>{incident.assessment.score === 0 ? 'NO MOVEMENT' : incident.assessment.severity}</small>
          </div>
        </header>

        <div className="method-example-result">
          <div><span>Effective points</span><strong>{incident.effectivePoints}</strong></div>
          <div><span>Index movement</span><strong>{formatMovement(incident.movementSeconds)}</strong></div>
          <div><span>Position after event</span><strong>{formatTime(incident.remainingSeconds)}</strong></div>
        </div>

        {incident.assessment.fullTrifecta && (
          <p className="method-trifecta-note">
            Full Trifecta: the incident receives the seven-point effective floor and a minimum CRITICAL classification.
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
            <strong>Assessment note</strong>
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
  const rawScore = CRITERIA.reduce((total, criterion) => total + (scores[criterion.key] ?? 0), 0);
  const fullTrifecta = ['t1', 't2', 't3'].every((key) => scores[key] === 1);
  const effectivePoints = calculateEffectivePoints(rawScore, fullTrifecta);
  const { remainingSeconds: projectedSeconds } = calculateClock(dataset.totalPoints + effectivePoints);
  const movementSeconds = dataset.remainingSeconds - projectedSeconds;

  const updateScore = (key: string, value: number) => {
    setScores((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="method-calculator">
      <form className="method-controls" onSubmit={(event) => event.preventDefault()}>
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
        <div className="method-projected-time">{formatTime(projectedSeconds)}</div>
        <p className="method-output-label">symbolic time remaining</p>

        <dl>
          <div><dt>Raw score</dt><dd>{rawScore} / 13</dd></div>
          <div><dt>Effective points</dt><dd>{effectivePoints}</dd></div>
          <div><dt>Current evidence base</dt><dd>{dataset.totalPoints} pts</dd></div>
          <div><dt>Movement</dt><dd>{formatMovement(movementSeconds)}</dd></div>
        </dl>

        {fullTrifecta && rawScore < 7 && (
          <p className="method-output-alert">The full Trifecta raises this incident to the seven-point effective floor.</p>
        )}
        {rawScore === 0 && (
          <p className="method-output-zero">Zero-score incident: recorded, with no clock movement.</p>
        )}
        <button type="button" className="button" onClick={() => setScores(initialScores)}>Reset controls</button>
      </aside>
    </div>
  );
}

export default function Methodology({ dataset }: MethodologyProps) {
  return (
    <div className="method-page">
      <section className="method-hero container" aria-labelledby="method-title">
        <div className="method-hero-heading">
          <p className="eyebrow">Methodology · Version {CALIBRATION.version} · {formatDate(CALIBRATION.effectiveDate)}</p>
          <h1 id="method-title">Show your working.</h1>
          <figure className="method-reference" aria-hidden="true">
            <img src={terminatorPortrait} alt="" width="500" height="500" loading="lazy" decoding="async" />
          </figure>
        </div>
        <div className="method-hero-copy">
          <p className="method-deck">
            The Skynet Countdown is a transparent editorial index of evidence that AI systems are moving beyond meaningful human control.
          </p>
          <p>
            Each incident is scored against eight published criteria. Those scores add to a cumulative evidence base, which a diminishing formula converts into symbolic time. The clock is an organising metaphor, not a probability, forecast or predicted date.
          </p>
        </div>
      </section>

      <section className="method-score-section container" aria-labelledby="scoring-title">
        <div className="section-heading">
          <p className="eyebrow">01 · Assessment</p>
          <h2 id="scoring-title">Three switches. Five amplifiers.</h2>
          <p>Score what happened, not the most dramatic thing that could happen next.</p>
        </div>

        <div className="method-tiers">
          <section className="method-tier method-tier-trifecta">
            <header><span>Tier 01</span><strong>0–3 points</strong></header>
            <h3>The Lethal Trifecta</h3>
            <p>One point for each condition that is demonstrably present. Each is manageable in isolation. Together, they create a route from hostile input to consequential action.</p>
            <div className="method-criteria-list">
              {CRITERIA.filter(({ tier }) => tier === 'trifecta').map((criterion) => (
                <article key={criterion.key}>
                  <b>{criterion.shortLabel}</b>
                  <div><h4>{criterion.label}</h4><p>{criterion.description}</p></div>
                  <span>0 / 1</span>
                </article>
              ))}
            </div>
            <p className="method-rule"><strong>Override:</strong> all three present means at least CRITICAL and a seven-point effective floor.</p>
          </section>

          <section className="method-tier method-tier-amplifiers">
            <header><span>Tier 02</span><strong>0–10 points</strong></header>
            <h3>Risk amplifiers</h3>
            <p>Broader conditions that increase the significance of the incident: 0 absent, 1 present, 2 significantly present.</p>
            <div className="method-criteria-list">
              {CRITERIA.filter(({ tier }) => tier === 'amplifier').map((criterion) => (
                <article key={criterion.key}>
                  <b>{criterion.shortLabel}</b>
                  <div><h4>{criterion.label}</h4><p>{criterion.description}</p></div>
                  <span>0 / 2</span>
                </article>
              ))}
            </div>
          </section>
        </div>

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
            <h2 id="formula-title">Pressure rises. The clock resists saturation.</h2>
            <p>Each new point moves the display closer to midnight, but by less than the point before it.</p>
          </div>
          <div className="method-formula-card">
            <p className="method-formula"><i>remaining seconds</i> = <span><b>{CALIBRATION.startingSeconds.toLocaleString('en-GB')}</b><em>1 + B / {CALIBRATION.halfwayPoints}</em></span></p>
            <dl>
              <div><dt>B</dt><dd>Cumulative effective points across distinct events</dd></div>
              <div><dt>{CALIBRATION.halfwayPoints}</dt><dd>The versioned half-scale: at {CALIBRATION.halfwayPoints} points, 30 symbolic minutes remain</dd></div>
              <div><dt>{CALIBRATION.startingSeconds.toLocaleString('en-GB')}</dt><dd>The full one-hour span, expressed in seconds</dd></div>
            </dl>
          </div>
          <div className="method-formula-copy">
            <p>
              The {CALIBRATION.halfwayPoints}-point parameter is an editorial calibration. It was selected to keep the index legible as the dataset grows; it was not derived scientifically or fitted to a desired current reading.
            </p>
            <p>
              The curve approaches midnight without reaching it. That leaves room for future evidence instead of saturating after a few severe stories. Fractional seconds are retained internally; the display reports less than one second near the limit.
            </p>
            <p>
              There is no passive ticking, decay or recovery model. Historical positions are recomputed when late records or corrections arrive, so they are reconstructions from the current dataset, not archived published readings.
            </p>
          </div>
        </div>
      </section>

      <section className="container method-examples-section" aria-labelledby="examples-title">
        <div className="section-heading">
          <p className="eyebrow">03 · Evidence</p>
          <h2 id="examples-title">Inspect a worked assessment.</h2>
          <p>Every point has a rationale. Choose any event to see the assessment that produced its movement.</p>
        </div>
        <ExampleInspector incidents={dataset.incidents} />
      </section>

      <section className="method-calculator-section" aria-labelledby="calculator-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">04 · Calculator</p>
            <h2 id="calculator-title">Try a hypothetical incident.</h2>
            <p>Set the eight criteria to see how another event would move the current dataset position.</p>
          </div>
          <IncidentCalculator dataset={dataset} />
        </div>
      </section>

      <section className="container method-provenance" aria-labelledby="provenance-title">
        <div className="section-heading">
          <p className="eyebrow">05 · Provenance</p>
          <h2 id="provenance-title">From signal to published record.</h2>
        </div>
        <ol className="method-pipeline">
          <li><span>01</span><strong>Scan</strong><p>Twenty-one AI and technology subreddits provide discovery signals.</p></li>
          <li><span>02</span><strong>Research</strong><p>The workflow follows qualifying posts to their original source articles.</p></li>
          <li><span>03</span><strong>Assess</strong><p>An AI scoring pass applies the eight criteria and records a rationale for each.</p></li>
          <li><span>04</span><strong>Edit</strong><p>Separate factual and analytical copy is produced for incident reports.</p></li>
        </ol>

        <div className="method-audit-grid">
          <article>
            <p className="eyebrow">Current data release</p>
            <strong>{dataset.incidents.length}</strong><span>unique events</span>
            <p>{dataset.assessmentCount} assessments · {dataset.editorialCount} reports covering {dataset.incidents.filter((item) => item.editorial).length} events · {dataset.incidents.filter((item) => !item.editorial).length} assessment-only events.</p>
          </article>
          <article>
            <h3>Reconciliation policy</h3>
            <p>
              Duplicate date-and-source assessments retain their audited historical versions but contribute once. Existing conflicts use the lower score conservatively. New conflicts are held for review rather than silently choosing the lowest value.
            </p>
            <p>
              Date-and-source collisions are reviewed manually. Records with different sources are merged only when a reviewed identity match shows they describe the same event. Legacy CVE labels are references, not reliable unique keys.
            </p>
          </article>
          <article>
            <h3>Download the records</h3>
            <p>The bundled CSV files are the raw inputs used by this build. Publishing appended records requires rebuilding the site.</p>
            <div className="method-downloads">
              <a className="button button-primary" href={assessmentsUrl} download>Assessment CSV</a>
              <a className="button" href={storiesUrl} download>Editorial CSV</a>
            </div>
            <p className="method-updated">Dataset current to {formatDate(dataset.lastUpdated)}.</p>
          </article>
        </div>
      </section>

      <section className="method-limitations" aria-labelledby="limitations-title">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">06 · Read before panicking</p>
            <h2 id="limitations-title">What this index cannot tell you.</h2>
          </div>
          <div className="method-limitations-grid">
            <p><strong>Coverage changes the reading.</strong> More reporting or a wider source list can add evidence points without an equivalent change in underlying risk. Different articles about the same event need an explicit identity review to avoid double counting.</p>
            <p><strong>It cannot determine loss of control.</strong> The clock is a consistent editorial lens on selected evidence. It is not a measurement of actual human control, extinction risk or time remaining.</p>
            <p><strong>The records are automated.</strong> The supplied assessments and reports were produced by an AI workflow and have not been independently fact-checked. Follow the original source before relying on a claim.</p>
            <p><strong>Judgement remains.</strong> Criteria make disagreement inspectable, not impossible. Scores reflect interpretation and the framework tends to underweight early governance signals.</p>
            <p><strong>Only adverse evidence moves the clock.</strong> This version has no recovery model. That is an editorial boundary, not a claim that improvement is impossible.</p>
          </div>
          <p className="method-closing">Transparent methodology does not make a clock objective. It makes the argument available for inspection.</p>
        </div>
      </section>
    </div>
  );
}

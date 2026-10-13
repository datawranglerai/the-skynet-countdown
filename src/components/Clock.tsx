import { CALIBRATION, formatTime, formatPressure } from '../lib/calibration';
import type { Dataset } from '../lib/types';

export default function Clock({ dataset }: { dataset: Dataset }) {
  const clockLabel = formatTime(dataset.remainingSeconds);
  const progress = Math.max(0, Math.min(1, (CALIBRATION.startingSeconds - dataset.remainingSeconds) / CALIBRATION.startingSeconds));
  const circumference = 2 * Math.PI * 208;
  const positionAngle = progress * Math.PI * 2 - Math.PI / 2;
  const position = { x: 300 + Math.cos(positionAngle) * 208, y: 300 + Math.sin(positionAngle) * 208 };
  const halfwayAngle = progress * Math.PI - Math.PI / 2;
  const halfway = { x: 300 + Math.cos(halfwayAngle) * 208, y: 300 + Math.sin(halfwayAngle) * 208 };
  // Two arcs also cover a complete turn when floating-point progress reaches 1.
  const progressSector = `M300 300L300 92A208 208 0 0 1 ${halfway.x} ${halfway.y}A208 208 0 0 1 ${position.x} ${position.y}Z`;
  const progressDash = `${circumference * progress} ${circumference}`;
  const horizonProgress = (CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds) / CALIBRATION.startingSeconds;
  const horizonAngle = horizonProgress * Math.PI * 2 - Math.PI / 2;
  const pointAtHorizon = (radius: number) => ({ x: 300 + Math.cos(horizonAngle) * radius, y: 300 + Math.sin(horizonAngle) * radius });
  const outer = pointAtHorizon(242);
  const inner = pointAtHorizon(216);
  const gateStart = pointAtHorizon(206);
  const gateEnd = pointAtHorizon(252);
  const horizonPath = `M${outer.x} ${outer.y} A242 242 0 0 1 300 58`;
  const horizonBand = `${horizonPath} L300 84 A216 216 0 0 0 ${inner.x} ${inner.y} Z`;
  const horizonTick = {
    x1: gateStart.x,
    y1: gateStart.y,
    x2: gateEnd.x,
    y2: gateEnd.y,
  };
  const horizonActive = dataset.clock.phase === 'event-horizon';
  const phaseDescription = horizonActive
    ? 'The Event Horizon phase is active following a published human decision.'
    : 'The clock is approaching the Event Horizon at 02:00. Crossing it requires a published human decision.';
  return <div className={`clock-panel${horizonActive ? ' has-entered-horizon' : ''}`}>
    <div className="clock-panel-top"><span>HUMAN CONTROL MONITOR</span></div>
    <div className="clock-instrument">
      <div className="clock-visual" role="img" aria-label={`${clockLabel} symbolic minutes to midnight, from a starting position of ${formatTime(CALIBRATION.startingSeconds)}. The red sector shows progress; the bright arc and diamond mark the current position. Editorial pressure index ${formatPressure(dataset.pressure)} out of 100. ${phaseDescription} The hatched danger zone marks the final two minutes.`}>
      <svg className="clock-svg" viewBox="0 0 600 600" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="dial-glow"><stop offset="0" stopColor="#eb553e" stopOpacity=".06" /><stop offset="1" stopColor="#eb553e" stopOpacity="0" /></radialGradient>
          <radialGradient id="progress-sector-shade" gradientUnits="userSpaceOnUse" cx="300" cy="300" r="208"><stop stopColor="var(--accent)" stopOpacity=".025" /><stop offset=".55" stopColor="var(--accent)" stopOpacity=".07" /><stop offset="1" stopColor="var(--accent)" stopOpacity=".18" /></radialGradient>
          <linearGradient id="horizon-crimson" gradientUnits="userSpaceOnUse" x1={outer.x} y1={outer.y} x2="300" y2="58"><stop stopColor="#79251d" /><stop offset=".5" stopColor="#451611" /><stop offset="1" stopColor="#8c291e" /></linearGradient>
          <pattern id="horizon-hatching" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0V9" stroke="#f66b50" strokeWidth="1.4" opacity=".58" /></pattern>
          <filter id="horizon-bloom" x="-35%" y="-50%" width="170%" height="200%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        <circle cx="300" cy="300" r="260" fill="url(#dial-glow)" />
        {progress > 0 && <path className="clock-progress-sector" d={progressSector} fill="url(#progress-sector-shade)" />}
        <path d="M300 31v30M300 539v30M31 300h30m478 0h30" stroke="#5a6156" strokeWidth="1" />
        <circle cx="300" cy="300" r="250" stroke="#252b24" strokeDasharray="2 7" />
        <circle cx="300" cy="300" r="208" stroke="#33392f" strokeWidth="2" />
        <circle className="clock-progress-glow" cx="300" cy="300" r="208" strokeDasharray={progressDash} transform="rotate(-90 300 300)" />
        <circle className="clock-progress-arc" cx="300" cy="300" r="208" strokeDasharray={progressDash} transform="rotate(-90 300 300)" />
        <circle cx="300" cy="300" r="194" stroke="#272d26" />
        <path className="event-horizon-bloom" d={horizonBand} fill="url(#horizon-crimson)" filter="url(#horizon-bloom)" />
        <path className="event-horizon-band" d={horizonBand} fill="url(#horizon-crimson)" />
        <path d={horizonBand} fill="url(#horizon-hatching)" />
        <path className="event-horizon-arc" d={horizonPath} />
        <path className="event-horizon-inner-edge" d={`M${inner.x} ${inner.y} A216 216 0 0 1 300 84`} />
        {Array.from({ length: 100 }, (_, index) => {
          const angle = (index / 100) * Math.PI * 2 - Math.PI / 2;
          const inHorizon = index / 100 >= horizonProgress;
          const tickInner = inHorizon ? 247 : index % 5 === 0 ? 219 : 227;
          const tickOuter = inHorizon ? 253 : 237;
          return <line key={index} x1={300 + Math.cos(angle) * tickInner} y1={300 + Math.sin(angle) * tickInner} x2={300 + Math.cos(angle) * tickOuter} y2={300 + Math.sin(angle) * tickOuter} stroke={inHorizon ? '#d55a43' : index / 100 <= progress ? 'var(--accent)' : '#495041'} strokeWidth={index % 5 === 0 ? '2' : '1'} />;
        })}
        <path className="event-horizon-connector" d={`M20 90H82L${gateEnd.x} ${gateEnd.y}`} />
        <line className="event-horizon-tick" {...horizonTick} />
        <line className="event-horizon-gate-core" {...horizonTick} />
        <circle className="clock-start-marker" cx="300" cy="92" r="3" />
        <g className="clock-position-marker" transform={`translate(${position.x} ${position.y})`}>
          <circle className="clock-position-halo" r="16" />
          <circle className="clock-position-backplate" r="11" />
          <path className="clock-position-diamond" d="M0-8 8 0 0 8-8 0Z" />
        </g>
        <path d="m294 72 6 10 6-10" fill="var(--accent)" />
        <path d="M129 290h12m-6-6v12m324-6h12m-6-6v12" stroke="#68705f" />
        <text x="300" y="139" textAnchor="middle" className="dial-label">MIDNIGHT / 00:00</text>
      </svg>
      <div className="clock-readout"><div className="clock-eyebrow"><span /> CURRENT POSITION</div><div className={`clock-digits${clockLabel.startsWith('>') ? ' is-boundary' : ''}`}>{clockLabel}</div><div className="clock-origin"><span>FROM</span><strong>{formatTime(CALIBRATION.startingSeconds)}</strong><span className="clock-unit">SYMBOLIC MIN : SEC</span></div><div className="clock-pressure"><span className="pressure-dot" />{formatPressure(dataset.pressure)}<span>/100 EVIDENCE PRESSURE</span></div></div>
      </div>
      <a className="event-horizon-callout" href="#/methodology/event-horizon" aria-label="Event Horizon at 02:00: point of no return. Read the methodology">
        <span className="event-horizon-callout-title">EVENT HORIZON</span>
        <strong>02:00</strong>
        <span className="event-horizon-callout-caption">POINT OF NO RETURN</span>
      </a>
    </div>
    {horizonActive && <div className="event-horizon-status is-active">
      <span className="event-horizon-state"><i />PHASE ACTIVE</span>
      {dataset.clock.approval?.editorialUrl && <a className="event-horizon-editorial" href={dataset.clock.approval.editorialUrl}>READ THE DECISION ↗</a>}
    </div>}
    <div className="clock-panel-bottom"><a href="#/methodology">SHOW THE WORKING ↗</a></div>
  </div>;
}

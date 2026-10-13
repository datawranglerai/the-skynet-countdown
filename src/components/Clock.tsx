import { CALIBRATION, formatTime, formatPressure } from '../lib/calibration';
import type { Dataset } from '../lib/types';

export default function Clock({ dataset }: { dataset: Dataset }) {
  const clockLabel = formatTime(dataset.remainingSeconds);
  const progress = Math.max(0, Math.min(1, (CALIBRATION.startingSeconds - dataset.remainingSeconds) / CALIBRATION.startingSeconds));
  const circumference = 2 * Math.PI * 208;
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
    <div className="clock-panel-top"><span>HUMAN CONTROL MONITOR</span><span className="monitoring"><i /> OBSERVING</span></div>
    <div className="clock-instrument">
      <div className="clock-visual" role="img" aria-label={`${clockLabel} symbolic minutes to midnight. Editorial pressure index ${formatPressure(dataset.pressure)} out of 100. ${phaseDescription} The hatched danger zone marks the final two minutes.`}>
      <svg className="clock-svg" viewBox="0 0 600 600" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="dial-glow"><stop offset="0" stopColor="#eb553e" stopOpacity=".06" /><stop offset="1" stopColor="#eb553e" stopOpacity="0" /></radialGradient>
          <linearGradient id="horizon-crimson" gradientUnits="userSpaceOnUse" x1={outer.x} y1={outer.y} x2="300" y2="58"><stop stopColor="#79251d" /><stop offset=".5" stopColor="#451611" /><stop offset="1" stopColor="#8c291e" /></linearGradient>
          <pattern id="horizon-hatching" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0V9" stroke="#f66b50" strokeWidth="1.4" opacity=".58" /></pattern>
          <filter id="horizon-bloom" x="-35%" y="-50%" width="170%" height="200%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        <circle cx="300" cy="300" r="260" fill="url(#dial-glow)" />
        <path d="M300 31v30M300 539v30M31 300h30m478 0h30" stroke="#5a6156" strokeWidth="1" />
        <circle cx="300" cy="300" r="250" stroke="#252b24" strokeDasharray="2 7" />
        <circle cx="300" cy="300" r="208" stroke="#33392f" strokeWidth="2" />
        <circle cx="300" cy="300" r="208" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 300 300)" />
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
        <path d="m294 72 6 10 6-10" fill="var(--accent)" />
        <path d="M129 290h12m-6-6v12m324-6h12m-6-6v12" stroke="#68705f" />
        <text x="300" y="139" textAnchor="middle" className="dial-label">MIDNIGHT / 00:00</text>
        <text x="300" y="466" textAnchor="middle" className="dial-label">METHOD 01 · BASELINE {formatTime(CALIBRATION.startingSeconds)}</text>
      </svg>
      <div className="clock-readout"><div className="clock-eyebrow"><span /> DISTANCE TO MIDNIGHT</div><div className={`clock-digits${clockLabel.startsWith('>') ? ' is-boundary' : ''}`}>{clockLabel}</div><div className="clock-unit">SYMBOLIC MINUTES : SECONDS</div><div className="clock-pressure"><span className="pressure-dot" />{formatPressure(dataset.pressure)}<span>/100 EVIDENCE PRESSURE</span></div></div>
      </div>
      <a className="event-horizon-callout" href="#/methodology/event-horizon" aria-label="Event Horizon at 02:00: point of no return. Read the methodology">
        <span className="event-horizon-callout-title">EVENT HORIZON</span>
        <strong>02:00</strong>
        <span className="event-horizon-callout-caption">POINT OF NO RETURN</span>
      </a>
    </div>
    <div className={`event-horizon-status${horizonActive ? ' is-active' : ''}`}>
      <span className="event-horizon-state"><i />{horizonActive ? 'PHASE ACTIVE' : 'HUMAN APPROVAL REQUIRED'}</span>
      {horizonActive && dataset.clock.approval?.editorialUrl && <a className="event-horizon-editorial" href={dataset.clock.approval.editorialUrl}>READ THE DECISION ↗</a>}
    </div>
    <div className="clock-panel-bottom"><span>DRIVEN BY EVIDENCE. NOT ELAPSED TIME.</span><a href="#/methodology">SHOW THE WORKING ↗</a></div>
  </div>;
}

import { CALIBRATION, formatTime, formatPressure } from '../lib/calibration';
import type { Dataset } from '../lib/types';

export default function Clock({ dataset }: { dataset: Dataset }) {
  const clockLabel = formatTime(dataset.remainingSeconds);
  const progress = Math.max(0, Math.min(1, (CALIBRATION.startingSeconds - dataset.remainingSeconds) / CALIBRATION.startingSeconds));
  const circumference = 2 * Math.PI * 208;
  const horizonProgress = (CALIBRATION.startingSeconds - CALIBRATION.horizonSeconds) / CALIBRATION.startingSeconds;
  const horizonAngle = horizonProgress * Math.PI * 2 - Math.PI / 2;
  const horizonRadius = 201;
  const horizonPath = `M${300 + Math.cos(horizonAngle) * horizonRadius} ${300 + Math.sin(horizonAngle) * horizonRadius} A${horizonRadius} ${horizonRadius} 0 0 1 300 ${300 - horizonRadius}`;
  const horizonTick = {
    x1: 300 + Math.cos(horizonAngle) * 214,
    y1: 300 + Math.sin(horizonAngle) * 214,
    x2: 300 + Math.cos(horizonAngle) * 242,
    y2: 300 + Math.sin(horizonAngle) * 242,
  };
  const horizonActive = dataset.clock.phase === 'event-horizon';
  const phaseDescription = horizonActive
    ? 'The Event Horizon phase is active following a published human decision.'
    : 'The clock is approaching the Event Horizon at 02:00. Crossing it requires a published human decision.';
  return <div className="clock-panel">
    <div className="clock-panel-top"><span>HUMAN CONTROL MONITOR</span><span className="monitoring"><i /> OBSERVING</span></div>
    <div className="clock-instrument" role="img" aria-label={`${formatTime(dataset.remainingSeconds)} symbolic minutes to midnight. Editorial pressure index ${formatPressure(dataset.pressure)} out of 100. ${phaseDescription}`}>
      <svg className="clock-svg" viewBox="0 0 600 600" fill="none" aria-hidden="true">
        <defs><radialGradient id="dial-glow"><stop offset="0" stopColor="#eb553e" stopOpacity=".06" /><stop offset="1" stopColor="#eb553e" stopOpacity="0" /></radialGradient></defs>
        <circle cx="300" cy="300" r="260" fill="url(#dial-glow)" />
        <path d="M300 31v30M300 539v30M31 300h30m478 0h30" stroke="#5a6156" strokeWidth="1" />
        <circle cx="300" cy="300" r="250" stroke="#252b24" strokeDasharray="2 7" />
        <circle cx="300" cy="300" r="208" stroke="#33392f" strokeWidth="2" />
        <circle cx="300" cy="300" r="208" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 300 300)" />
        <circle cx="300" cy="300" r="194" stroke="#272d26" />
        <path className="event-horizon-arc" d={horizonPath} />
        <line className="event-horizon-tick" {...horizonTick} />
        {Array.from({ length: 100 }, (_, index) => {
          const angle = (index / 100) * Math.PI * 2 - Math.PI / 2;
          const inner = index % 5 === 0 ? 219 : 227;
          return <line key={index} x1={300 + Math.cos(angle) * inner} y1={300 + Math.sin(angle) * inner} x2={300 + Math.cos(angle) * 237} y2={300 + Math.sin(angle) * 237} stroke={index / 100 <= progress ? 'var(--accent)' : '#495041'} strokeWidth={index % 5 === 0 ? '2' : '1'} />;
        })}
        <path d="m294 72 6 10 6-10" fill="var(--accent)" />
        <path d="M129 290h12m-6-6v12m324-6h12m-6-6v12" stroke="#68705f" />
        <text x="300" y="139" textAnchor="middle" className="dial-label">MIDNIGHT / 00:00</text>
        <text x="300" y="466" textAnchor="middle" className="dial-label">METHOD 01 · BASELINE {formatTime(CALIBRATION.startingSeconds)}</text>
      </svg>
      <div className="clock-readout"><div className="clock-eyebrow"><span /> DISTANCE TO MIDNIGHT</div><div className={`clock-digits${clockLabel.startsWith('>') ? ' is-boundary' : ''}`}>{clockLabel}</div><div className="clock-unit">SYMBOLIC MINUTES : SECONDS</div><div className="clock-pressure"><span className="pressure-dot" />{formatPressure(dataset.pressure)}<span>/100 EVIDENCE PRESSURE</span></div></div>
    </div>
    <div className={`event-horizon-status${horizonActive ? ' is-active' : ''}`}>
      <a href="#/methodology/event-horizon"><span>EVENT HORIZON</span><strong>02:00</strong></a>
      <span className="event-horizon-state"><i />{horizonActive ? 'PHASE ACTIVE' : 'HUMAN APPROVAL REQUIRED'}</span>
      {horizonActive && dataset.clock.approval?.editorialUrl && <a className="event-horizon-editorial" href={dataset.clock.approval.editorialUrl}>READ THE DECISION ↗</a>}
    </div>
    <div className="clock-panel-bottom"><span>DRIVEN BY EVIDENCE. NOT ELAPSED TIME.</span><a href="#/methodology">SHOW THE WORKING ↗</a></div>
  </div>;
}

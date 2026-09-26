import { formatTime } from '../lib/index';
import type { Dataset } from '../lib/types';

export default function Clock({ dataset }: { dataset: Dataset }) {
  const progress = dataset.pressure / 100;
  const circumference = 2 * Math.PI * 208;
  return <div className="clock-panel">
    <div className="clock-panel-top"><span>HUMAN CONTROL MONITOR</span><span className="monitoring"><i /> OBSERVING</span></div>
    <div className="clock-instrument" role="img" aria-label={`${formatTime(dataset.remainingSeconds)} symbolic minutes to midnight. Editorial pressure index ${dataset.pressure.toFixed(1)} out of 100.`}>
      <svg className="clock-svg" viewBox="0 0 600 600" fill="none" aria-hidden="true">
        <defs><radialGradient id="dial-glow"><stop offset="0" stopColor="#eb553e" stopOpacity=".06" /><stop offset="1" stopColor="#eb553e" stopOpacity="0" /></radialGradient></defs>
        <circle cx="300" cy="300" r="260" fill="url(#dial-glow)" />
        <path d="M300 31v30M300 539v30M31 300h30m478 0h30" stroke="#5a6156" strokeWidth="1" />
        <circle cx="300" cy="300" r="250" stroke="#252b24" strokeDasharray="2 7" />
        <circle cx="300" cy="300" r="208" stroke="#33392f" strokeWidth="2" />
        <circle cx="300" cy="300" r="208" stroke="var(--accent)" strokeWidth="3" strokeDasharray={`${circumference * progress} ${circumference}`} transform="rotate(-90 300 300)" />
        <circle cx="300" cy="300" r="194" stroke="#272d26" />
        {Array.from({ length: 100 }, (_, index) => {
          const angle = (index / 100) * Math.PI * 2 - Math.PI / 2;
          const inner = index % 5 === 0 ? 219 : 227;
          return <line key={index} x1={300 + Math.cos(angle) * inner} y1={300 + Math.sin(angle) * inner} x2={300 + Math.cos(angle) * 237} y2={300 + Math.sin(angle) * 237} stroke={index / 100 <= progress ? 'var(--accent)' : '#495041'} strokeWidth={index % 5 === 0 ? '2' : '1'} />;
        })}
        <path d="m294 72 6 10 6-10" fill="var(--accent)" />
        <path d="M129 290h12m-6-6v12m324-6h12m-6-6v12" stroke="#68705f" />
        <text x="300" y="139" textAnchor="middle" className="dial-label">MIDNIGHT / 00:00</text>
        <text x="300" y="466" textAnchor="middle" className="dial-label">METHOD 02 · BASELINE 60:00</text>
      </svg>
      <div className="clock-readout"><div className="clock-eyebrow"><span /> DISTANCE TO MIDNIGHT</div><div className="clock-digits">{formatTime(dataset.remainingSeconds)}</div><div className="clock-unit">SYMBOLIC MINUTES : SECONDS</div><div className="clock-pressure"><span className="pressure-dot" />{dataset.pressure.toFixed(1)}<span>/100 EVIDENCE PRESSURE</span></div></div>
    </div>
    <div className="clock-panel-bottom"><span>DRIVEN BY EVIDENCE. NOT ELAPSED TIME.</span><a href="#/methodology">SHOW THE WORKING ↗</a></div>
  </div>;
}

import { useState } from 'react';
import type { Incident } from '../lib/types';
import { formatTime, formatGapClosedPercent } from '../lib/index';
import { Arrow, dateLabel, movementLabel } from './Shared';

export default function Timeline({ incidents }: { incidents: Incident[] }) {
  const [selected, setSelected] = useState(incidents.length - 1);
  const event = incidents[selected];
  if (!event) return <p>No evidence has been recorded yet.</p>;
  const start = new Date(`${incidents[0].assessment.date}T00:00:00Z`).getTime() - 86400000;
  const end = Math.max(start + 86400000, new Date(`${incidents.at(-1)!.assessment.date}T00:00:00Z`).getTime());
  const x = (incident: Incident) => 24 + ((new Date(`${incident.assessment.date}T00:00:00Z`).getTime() - start) / (end - start)) * 852;
  const y = (incident: Incident) => 190 - ((3600 - incident.remainingSeconds) / 3600) * 165;
  const path = `M24 190 ${incidents.map((incident) => `H${x(incident)}V${y(incident)}`).join(' ')}`;
  const monthNames = Array.from({ length: 5 }, (_, index) => dateLabel(new Date(start + (end - start) * index / 4).toISOString().slice(0, 10)));
  return <div className="timeline-layout">
    <div className="timeline-chart-wrap">
      <div className="chart-key"><span><i /> SYMBOLIC DISTANCE TO MIDNIGHT</span><span>CALCULATED FROM INCIDENT SCORES</span></div>
      <svg className="timeline-chart" viewBox="0 0 930 240" role="img" aria-label={`Clock history from ${dateLabel(incidents[0].assessment.date)} to ${dateLabel(incidents.at(-1)!.assessment.date)}. It moves from 60 minutes to ${formatTime(incidents.at(-1)!.remainingSeconds)}. Use the slider below to inspect each event.`}>
        <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f15b40" stopOpacity=".14" /><stop offset="1" stopColor="#f15b40" stopOpacity="0" /></linearGradient></defs>
        {[25, 80, 135, 190].map((gridY, index) => <g key={gridY}><line x1="24" y1={gridY} x2="878" y2={gridY} stroke="#30372f" strokeDasharray="3 6" /><text x="894" y={gridY + 4} className="chart-axis">{index * 20}m</text></g>)}
        <path d={`${path} V207H24Z`} fill="url(#chart-fill)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <line x1={x(event)} y1="18" x2={x(event)} y2="205" stroke="#939b90" strokeDasharray="4 4" />
        {incidents.map((incident, index) => <circle key={incident.id} cx={x(incident)} cy={y(incident)} r={index === selected ? 5 : 2.5} fill={index === selected ? '#eeeee7' : '#f15b40'} onMouseEnter={() => setSelected(index)} />)}
        {monthNames.map((name, index) => <text key={index} x={24 + index * 213} y="231" className="chart-axis" textAnchor={index === 4 ? 'end' : 'start'}>{name.toUpperCase()}</text>)}
      </svg>
      <label className="timeline-slider-label" htmlFor="history-range">EXPLORE THE RECORD <span>{selected + 1} / {incidents.length}</span></label>
      <input id="history-range" className="history-range" type="range" min="0" max={incidents.length - 1} value={selected} onChange={(event) => setSelected(Number(event.target.value))} aria-valuetext={`${dateLabel(event.assessment.date, true)}: ${event.headline}. ${formatTime(event.remainingSeconds)} remaining.`} />
      <p className="chart-footnote">Ordered by assessment date. Every step is a scored event; flat periods add no evidence points.</p>
    </div>
    <div className="timeline-selected" aria-live="polite">
      <div className="eyebrow">{dateLabel(event.assessment.date, true)}</div>
      <span className="timeline-time">{formatTime(event.remainingSeconds)}</span>
      <span className="mono-label">SYMBOLIC MINUTES REMAINING</span>
      <h3><a href={`#/incidents/${event.id}`}>{event.headline}</a></h3>
      <div className="timeline-event-bottom"><span><b className="timeline-gap">{formatGapClosedPercent(event.gapClosedPercent)} OF REMAINING GAP</b><small>{event.effectivePoints} POINTS · {movementLabel(event.movementSeconds)} AT THIS POINT</small></span><a href={`#/incidents/${event.id}`} aria-label={`Read ${event.headline}`}><Arrow diagonal /></a></div>
    </div>
  </div>;
}

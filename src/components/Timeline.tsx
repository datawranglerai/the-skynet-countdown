import { useState } from 'react';
import type { Dataset, Incident } from '../lib/types';
import { CALIBRATION, formatTime, formatGapClosedPercent } from '../lib/calibration';
import { Arrow, dateLabel, movementLabel } from './Shared';

export default function Timeline({ incidents, clock, currentRemainingSeconds }: { incidents: Incident[]; clock?: Dataset['clock']; currentRemainingSeconds?: number }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIndex = selectedId ? incidents.findIndex((incident) => incident.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? selectedIndex : incidents.length - 1;
  const select = (index: number) => setSelectedId(index === incidents.length - 1 ? null : incidents[index]?.id ?? null);
  const event = incidents[selected];
  if (!event) return <p>No evidence has been recorded yet.</p>;
  const start = new Date(`${incidents[0].assessment.date}T00:00:00Z`).getTime() - 86400000;
  const end = Math.max(start + 86400000, new Date(`${incidents.at(-1)!.assessment.date}T00:00:00Z`).getTime());
  const x = (incident: Incident) => 24 + ((new Date(`${incident.assessment.date}T00:00:00Z`).getTime() - start) / (end - start)) * 852;
  const startingSeconds = CALIBRATION.startingSeconds;
  const y = (incident: Incident) => 190 - ((startingSeconds - incident.remainingSeconds) / startingSeconds) * 165;
  const yForSeconds = (seconds: number) => 190 - ((startingSeconds - seconds) / startingSeconds) * 165;
  const transitionIndex = clock?.transition ? incidents.findIndex((incident) => incident.id === clock.transition?.afterIncidentId) : -1;
  const transitionX = transitionIndex >= 0 ? x(incidents[transitionIndex]) : undefined;
  const horizonY = yForSeconds(CALIBRATION.horizonSeconds);
  const fullPath = `M24 190 ${incidents.map((incident, index) => `${index === transitionIndex ? `H${x(incident)}V${y(incident)}V${horizonY}` : `H${x(incident)}V${y(incident)}`}`).join(' ')}`;
  const path = `M24 190 ${incidents.map((incident, index) => `${index === transitionIndex ? `H${x(incident)}V${y(incident)} M${x(incident)} ${horizonY}` : `H${x(incident)}V${y(incident)}`}`).join(' ')}`;
  const monthNames = Array.from({ length: 5 }, (_, index) => dateLabel(new Date(start + (end - start) * index / 4).toISOString().slice(0, 10)));
  const belowHorizonThreshold = event.clockPhase === 'event-horizon' && event.effectivePoints === 0;
  const gapDestination = event.clockPhase === 'event-horizon' ? 'MIDNIGHT' : 'EVENT HORIZON';
  return <div className="timeline-layout">
    <div className="timeline-chart-wrap">
      <div className="chart-key"><span><i /> SYMBOLIC DISTANCE TO MIDNIGHT</span><span>CALCULATED FROM INCIDENT SCORES</span></div>
      <svg className="timeline-chart" viewBox="0 0 930 240" role="img" aria-label={`Clock history from ${dateLabel(incidents[0].assessment.date)} to ${dateLabel(incidents.at(-1)!.assessment.date)}. Starting at ${startingSeconds / 60} symbolic minutes, the clock reaches ${formatTime(currentRemainingSeconds ?? incidents.at(-1)!.remainingSeconds)}.${clock?.transition ? ' The human-approved Event Horizon entry is marked separately from incident movement.' : ''} Use the slider below to inspect each event.`}>
        <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f15b40" stopOpacity=".14" /><stop offset="1" stopColor="#f15b40" stopOpacity="0" /></linearGradient></defs>
        {[25, 80, 135, 190].map((gridY, index) => <g key={gridY}><line x1="24" y1={gridY} x2="878" y2={gridY} stroke="#30372f" strokeDasharray="3 6" /><text x="894" y={gridY + 4} className="chart-axis">{index * startingSeconds / 180}m</text></g>)}
        <line className="timeline-horizon-line" x1="24" y1={horizonY} x2="878" y2={horizonY} />
        <text x="30" y={horizonY - 6} className="timeline-horizon-label">EVENT HORIZON · 02:00</text>
        <path d={`${fullPath} V207H24Z`} fill="url(#chart-fill)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {transitionX !== undefined && clock?.transition && <g className="timeline-transition-marker">
          <line x1={transitionX} y1={yForSeconds(clock.transition.remainingSecondsBefore)} x2={transitionX} y2={horizonY} />
          <circle cx={transitionX} cy={yForSeconds(clock.transition.remainingSecondsBefore)} r="3" />
          <circle cx={transitionX} cy={horizonY} r="3" />
          <text x={transitionX > 700 ? transitionX - 8 : transitionX + 8} textAnchor={transitionX > 700 ? 'end' : 'start'} y={(yForSeconds(clock.transition.remainingSecondsBefore) + horizonY) / 2 - 4}>HUMAN-APPROVED ENTRY</text>
        </g>}
        <line x1={x(event)} y1="18" x2={x(event)} y2="205" stroke="#939b90" strokeDasharray="4 4" />
        {incidents.map((incident, index) => <circle key={incident.id} cx={x(incident)} cy={y(incident)} r={index === selected ? 5 : 2.5} fill={index === selected ? '#eeeee7' : '#f15b40'} onMouseEnter={() => select(index)} />)}
        {monthNames.map((name, index) => <text key={index} x={24 + index * 213} y="231" className="chart-axis" textAnchor={index === 4 ? 'end' : 'start'}>{name.toUpperCase()}</text>)}
      </svg>
      <label className="timeline-slider-label" htmlFor="history-range">EXPLORE THE RECORD <span>{selected + 1} / {incidents.length}</span></label>
      <input id="history-range" className="history-range" type="range" min="0" max={incidents.length - 1} value={selected} onChange={(event) => select(Number(event.target.value))} aria-valuetext={`${dateLabel(event.assessment.date, true)}: ${event.headline}. ${formatTime(event.remainingSeconds)} remaining.`} />
      <p className="chart-footnote">Ordered by assessment date. Incident markers show the position after each record; flat periods add no clock-eligible points.{clock?.transition ? ' Event Horizon entry is shown as a separate human-approved adjustment.' : ''}</p>
    </div>
    <div className="timeline-selected" aria-live="polite">
      <div className="eyebrow">{dateLabel(event.assessment.date, true)}</div>
      <span className="timeline-time">{formatTime(event.remainingSeconds)}</span>
      <span className="mono-label">SYMBOLIC MINUTES REMAINING</span>
      <h3><a href={`#/incidents/${event.id}`}>{event.headline}</a></h3>
      <div className="timeline-event-bottom"><span>{belowHorizonThreshold
        ? <><b className="timeline-gap no-movement">BELOW EVENT HORIZON THRESHOLD · NO CLOCK MOVEMENT</b><small>{event.scoring.totalPoints} PUBLISHED POINTS · 10 REQUIRED TO MOVE THE CLOCK</small></>
        : <><b className="timeline-gap">{formatGapClosedPercent(event.gapClosedPercent)} OF GAP TO {gapDestination}</b><small>{event.effectivePoints} CLOCK-ELIGIBLE POINTS · {movementLabel(event.movementSeconds)} AT THIS POINT</small></>}
      </span><a href={`#/incidents/${event.id}`} aria-label={`Read ${event.headline}`}><Arrow diagonal /></a></div>
    </div>
  </div>;
}

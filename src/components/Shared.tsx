import type { Incident, Severity } from '../lib/types';
import { CRITERIA, formatGapClosedPercent } from '../lib/index';

export function Arrow({ diagonal = false, className = '' }: { diagonal?: boolean; className?: string }) {
  return <svg className={`arrow-icon ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.6" /></svg>;
}

export function Logo() {
  return <a className="brand" href="#/" aria-label="The Skynet Countdown home"><svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M11 6h27l-6 7H5zm-6 11h27l-6 7H0zm8 11h14l-6 7H7z" fill="currentColor" /></svg><span>SKYNET<span>COUNTDOWN</span></span></a>;
}

export function SeverityBadge({ severity, score }: { severity: Severity; score?: number }) {
  return <span className={`severity severity-${score === 0 ? 'zero' : severity.toLowerCase()}`}><span />{score === 0 ? 'NO MOVEMENT' : severity}</span>;
}

export function dateLabel(value: string, year = false) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

export function movementLabel(value: number) {
  if (value === 0) return 'No movement';
  if (value < 1) return '−<1s';
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  return `−${minutes ? `${minutes}m ` : ''}${rounded % 60}s`;
}

export function ScoreStrip({ incident }: { incident: Incident }) {
  return <div className="score-strip" aria-label={`Score ${incident.assessment.score} of 13`}>
    {CRITERIA.map((criterion) => <span key={criterion.key} className={incident.assessment.scores[criterion.key] > 0 ? 'filled' : ''} title={`${criterion.label}: ${incident.assessment.scores[criterion.key]}/${criterion.max}`} />)}
  </div>;
}

export function IncidentCard({ incident, index }: { incident: Incident; index: number }) {
  return <article className="incident-card">
    <div className="card-top"><SeverityBadge severity={incident.assessment.severity} score={incident.assessment.score} /><time dateTime={incident.assessment.date}>{dateLabel(incident.assessment.date)}</time></div>
    <div className="card-number">FIELD REPORT / {String(index + 1).padStart(2, '0')}</div>
    <h3><a href={`#/incidents/${incident.id}`}>{incident.headline}<span className="card-link-cover" /></a></h3>
    <p>{incident.editorial?.story ?? incident.assessment.title}</p>
    <div className="card-bottom"><div><ScoreStrip incident={incident} /><span className="mono-label">{incident.assessment.score}/13 RISK SCORE</span></div><span className="card-movement"><span><b>{formatGapClosedPercent(incident.gapClosedPercent)}</b><small>OF REMAINING GAP</small></span><Arrow diagonal /></span></div>
  </article>;
}

export function TextParagraphs({ text }: { text: string }) {
  return <>{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

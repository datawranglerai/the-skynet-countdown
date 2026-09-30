import { useMemo, useState } from 'react';
import type { Dataset, Severity } from '../lib/types';
import { formatGapClosedPercent } from '../lib/calibration';
import { SEVERITIES } from '../lib/criteria';
import { MAX_SCORE } from '../lib/scoring';
import { Arrow, dateLabel, ScoreStrip, SeverityBadge } from '../components/Shared';

export default function Archive({ dataset }: { dataset: Dataset }) {
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState<Severity | 'ALL' | 'NONE'>('ALL');
  const [leadingOnly, setLeadingOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const severities = SEVERITIES;
  const filtered = useMemo(() => dataset.incidents.filter((incident) => {
    const assessment = incident.assessment;
    const text = [incident.publicId, incident.headline, assessment.title, assessment.sourceUrl, incident.editorial?.story, incident.editorial?.take, ...incident.assessments.map((version) => version.cveId)].join(' ').toLowerCase();
    const matchesSeverity = severity === 'ALL' || (severity === 'NONE' ? incident.scoring.totalPoints === 0 : incident.scoring.severity === severity);
    return text.includes(query.trim().toLowerCase()) && matchesSeverity && (!leadingOnly || assessment.leadingIndicator);
  }).sort((a, b) => sort === 'score' ? b.effectivePoints - a.effectivePoints || b.assessment.date.localeCompare(a.assessment.date) : sort === 'oldest' ? a.assessment.date.localeCompare(b.assessment.date) : b.assessment.date.localeCompare(a.assessment.date)), [dataset.incidents, query, severity, leadingOnly, sort]);

  return <div className="container archive-page"><header className="page-intro"><div className="eyebrow">THE EVIDENCE / OPEN FOR INSPECTION</div><h1>THE INCIDENT<br /><span>ARCHIVE.</span></h1><p>Developments, not omens. The full record of what happened, how we scored it, and why it matters.</p></header>
    <div className="archive-controls"><label className="search-field"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="1.5" /></svg><input type="search" placeholder="Search developments, sources, or IDs…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search incidents" /></label><label className="sort-control">SORT BY<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score">Highest evidence score</option></select></label></div>
    <div className="archive-filters"><div className="severity-filters" role="group" aria-label="Filter by severity"><button className={severity === 'ALL' ? 'active' : ''} aria-pressed={severity === 'ALL'} onClick={() => setSeverity('ALL')}>ALL SIGNALS</button>{severities.map((value) => <button key={value} className={severity === value ? 'active' : ''} aria-pressed={severity === value} onClick={() => setSeverity(value)}>{value}</button>)}<button className={severity === 'NONE' ? 'active' : ''} aria-pressed={severity === 'NONE'} onClick={() => setSeverity('NONE')}>NO MOVEMENT</button></div><label className="leading-filter"><input type="checkbox" checked={leadingOnly} onChange={(event) => setLeadingOnly(event.target.checked)} /> Leading indicators</label></div>
    <p className="archive-impact-key">Compare incident scores and the percentage of the remaining symbolic gap they close. <a href="#/methodology">How impact works ↗</a></p>
    <div className="archive-count" aria-live="polite"><span>{filtered.length} OF {dataset.incidents.length} DEVELOPMENTS</span><span>DUPLICATE EVENTS COUNTED ONCE</span></div>
    <div className="archive-list">{filtered.map((incident) => <article className="archive-row" key={incident.id}><div className="archive-date"><time dateTime={incident.assessment.date}>{dateLabel(incident.assessment.date)}</time><span>{incident.assessment.date.slice(0, 4)}</span></div><div className="archive-content"><div className="archive-row-meta"><SeverityBadge severity={incident.scoring.severity} score={incident.scoring.totalPoints} />{incident.assessment.leadingIndicator && <span className="leading-label">↗ LEADING INDICATOR</span>}</div><h2><a href={`#/incidents/${incident.id}`}>{incident.headline}</a></h2><p>{incident.publicId ?? incident.assessment.cveId} · {incident.editorial?.metadata || new URL(incident.assessment.sourceUrl).hostname.replace('www.', '')}</p></div><div className="archive-score"><strong>{incident.scoring.totalPoints}<span>/{MAX_SCORE}</span></strong><ScoreStrip incident={incident} /><span className="mono-label" aria-label={`${formatGapClosedPercent(incident.gapClosedPercent)} of the remaining gap closed`}>{formatGapClosedPercent(incident.gapClosedPercent)}<small>GAP CLOSED</small></span></div><a className="archive-open" href={`#/incidents/${incident.id}`} aria-label={`Read ${incident.headline}`}><Arrow diagonal /></a></article>)}</div>
    {filtered.length === 0 && <div className="empty-state"><span>Ø</span><h2>No matching developments.</h2><p>Try another search or widen the filters.</p><button className="button button-outline" onClick={() => { setQuery(''); setSeverity('ALL'); setLeadingOnly(false); }}>Clear filters <Arrow /></button></div>}
    <p className="archive-disclosure">All {dataset.assessmentCount} assessment versions are preserved. Repeated coverage is grouped into {dataset.incidents.length} events. <a href="#/methodology">Read the reconciliation policy ↗</a></p>
  </div>;
}

import type { Dataset } from '../lib/types';
import Clock from '../components/Clock';
import Timeline from '../components/Timeline';
import { Arrow, dateLabel, IncidentCard } from '../components/Shared';
import terminatorFigure from '../../assets/terminator-3.png';

export default function Home({ dataset }: { dataset: Dataset }) {
  const recent = [...dataset.incidents].reverse().filter((incident) => incident.editorial).slice(0, 3);
  return <>
    <section className="hero container">
      <div className="hero-copy"><div className="eyebrow"><span className="tiny-square" /> A FIELD GUIDE TO LOSING CONTROL</div><h1>THE FUTURE<br />IS NOT <span>SET.</span></h1><p className="hero-subheading">But we’re keeping score.</p><p className="hero-description">A living record of the AI developments bringing us closer to a world beyond meaningful human control. Every score explained. Every judgement open to question.</p><div className="hero-actions"><a className="button button-primary" href="#/incidents">Explore the incidents <Arrow /></a><a className="text-link" href="#/methodology">How the clock works <Arrow diagonal /></a></div><div className="hero-footnote"><span>↳</span> THE TERMINATOR REFERENCE IS A JOKE.<br /><span className="footnote-second">THE FOOTNOTES AREN’T.</span></div></div>
      <Clock dataset={dataset} />
    </section>
    <section className="stats-strip container" aria-label="Dataset summary">
      <div><span className="stat-number">{String(dataset.incidents.length).padStart(2, '0')}</span><span className="stat-caption">DEVELOPMENTS<br />ON THE RECORD</span></div>
      <div><span className="stat-number">{dataset.totalPoints}</span><span className="stat-caption">CUMULATIVE<br />EVIDENCE POINTS</span></div>
      <div><span className="stat-number stat-accent">{String(dataset.incidents.filter((incident) => incident.assessment.fullTrifecta).length).padStart(2, '0')}</span><span className="stat-caption">FULL TRIFECTA<br />DETECTED</span></div>
      <div className="stat-latest"><span className="stat-caption">LATEST RECORDED EVENT</span><span className="stat-date">{dateLabel(dataset.lastUpdated, true).toUpperCase()}</span><span className="stat-caption">UPDATED AS EVIDENCE ARRIVES</span></div>
    </section>
    <section className="section container" id="trajectory"><div className="section-heading"><div><div className="eyebrow">01 / THE TRAJECTORY</div><h2>A little closer. One decision at a time.</h2></div><a className="text-link" href="#/methodology">Understand the scale <Arrow diagonal /></a></div><Timeline incidents={dataset.incidents} /></section>
    <section className="section section-records container"><div className="section-heading"><div><div className="eyebrow">02 / RECENT FIELD REPORTS</div><h2>What moved the needle.</h2></div><a className="text-link" href="#/incidents">All {dataset.incidents.length} developments <Arrow /></a></div><div className="incident-grid">{recent.map((incident, index) => <IncidentCard incident={incident} index={index} key={incident.id} />)}</div></section>
    <section className="method-teaser container"><div><div className="eyebrow">03 / SHOW YOUR WORKING</div><h2>Less prophecy.<br /><span>More methodology.</span></h2><p>Three conditions. Five amplifiers. Thirteen possible points. A framework you can inspect, reproduce, and argue with.</p><a className="button button-outline" href="#/methodology">Inside the methodology <Arrow diagonal /></a></div><div className="trifecta-teaser"><div className="trifecta-heading">THE LETHAL TRIFECTA <span>3 / 3 = CRITICAL</span></div><div><span>T1</span><p>Ungoverned access<small>The keys to something that matters.</small></p><span className="trifecta-cross">+</span></div><div><span>T2</span><p>Untrusted input<small>An open door to outside instructions.</small></p><span className="trifecta-cross">+</span></div><div><span>T3</span><p>Autonomous action<small>The ability to act without asking.</small></p><span className="trifecta-cross">↗</span></div></div></section>
    <section className="manifesto-feature container" aria-labelledby="manifesto-title">
      <div className="manifesto-copy">
        <div className="eyebrow">THE FICTION / THE REALITY</div>
        <h2 id="manifesto-title">NO FATE BUT<br />WHAT WE MAKE.</h2>
        <p>A metaphor for paying attention.<br />Not a prediction of the end.</p>
        <a className="text-link" href="#/methodology">Understand the framework <Arrow diagonal /></a>
      </div>
      <div className="manifesto-visual" aria-hidden="true">
        <div className="manifesto-portrait">
          <img src={terminatorFigure} alt="" width="979" height="1920" loading="lazy" decoding="async" />
          <span className="manifesto-flare" />
        </div>
      </div>
    </section>
  </>;
}

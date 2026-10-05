import type { Dataset } from '../lib/types';
import Clock from '../components/Clock';
import Timeline from '../components/Timeline';
import { Arrow, dateLabel, IncidentCard } from '../components/Shared';
import ImageCredit from '../components/ImageCredit';
import robotFigure from '../../assets/optimized/black-and-white-robot.webp';

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
    <section className="manifesto-feature container" aria-labelledby="manifesto-title">
      <div className="eyebrow manifesto-eyebrow">03 / THE FRAMEWORK</div>
      <div className="manifesto-copy">
        <h2 id="manifesto-title">NO FATE BUT<br /><span>WHAT WE <em>MAKE.</em></span></h2>
      </div>
      <figure className="manifesto-visual">
        <div className="manifesto-portrait">
          <img src={robotFigure} alt="" width="960" height="1440" loading="lazy" decoding="async" />
        </div>
        <ImageCredit filename="Black and White Robot Photo.jpg" />
      </figure>
      <div className="manifesto-note">
        <p>Three conditions. Five amplifiers.<br />Every score explained.</p>
      </div>
      <div className="manifesto-framework">
        <ul className="manifesto-conditions" aria-label="The three framework conditions" role="list">
          <li>Ungoverned access</li>
          <li><span aria-hidden="true">+</span>Untrusted input</li>
          <li><span aria-hidden="true">+</span>Autonomous action</li>
        </ul>
        <a className="text-link" href="#/methodology">Explore the methodology <Arrow diagonal /></a>
      </div>
    </section>
  </>;
}

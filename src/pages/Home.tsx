import type { Dataset } from '../lib/types';
import Clock from '../components/Clock';
import Timeline from '../components/Timeline';
import { Arrow, dateLabel, FRAMEWORK_REPOSITORY_URL, IncidentCard } from '../components/Shared';
import ImageCredit from '../components/ImageCredit';
import robotFigure from '../../assets/optimized/black-and-white-robot.webp';

const githubRibbon = 'M-12 59 C9 37 33 48 53 72 C76 100 110 102 143 90 C171 90 194 88 222 92 C253 96 282 98 323 80';

export default function Home({ dataset }: { dataset: Dataset }) {
  const recent = [...dataset.incidents].reverse().filter((incident) => incident.editorial).slice(0, 3);
  return <>
    <section className="hero container">
      <div className="hero-copy"><h1>THE FUTURE<br />IS NOT <span>SET.</span></h1><p className="hero-subheading">But we’re keeping score.</p><p className="hero-description">A living record of the AI developments bringing us closer to a world beyond meaningful human control. Every score explained. Every judgement open to question.</p><div className="hero-actions"><a className="button button-primary" href="#/incidents">Explore the incidents <Arrow /></a><a className="text-link" href="#/methodology">How the clock works <Arrow diagonal /></a></div><div className="hero-footnote"><span>↳</span> THE TERMINATOR REFERENCE IS A JOKE.<br /><span className="footnote-second">THE FOOTNOTES AREN’T.</span></div></div>
      <Clock dataset={dataset} />
    </section>
    <section className="stats-strip container" aria-label="Dataset summary">
      <div><span className="stat-number">{String(dataset.incidents.length).padStart(2, '0')}</span><span className="stat-caption">DEVELOPMENTS<br />ON THE RECORD</span></div>
      <div><span className="stat-number">{dataset.totalPoints}</span><span className="stat-caption">CUMULATIVE<br />EVIDENCE POINTS</span></div>
      <div><span className="stat-number stat-accent">{String(dataset.incidents.filter((incident) => incident.assessment.fullTrifecta).length).padStart(2, '0')}</span><span className="stat-caption">FULL TRIFECTA<br />DETECTED</span></div>
      <div className="stat-latest"><span className="stat-caption">LATEST RECORDED EVENT</span><span className="stat-date">{dateLabel(dataset.lastUpdated, true).toUpperCase()}</span><span className="stat-caption">UPDATED AS EVIDENCE ARRIVES</span></div>
    </section>
    <section className="section container" id="trajectory"><div className="section-heading"><div><div className="eyebrow">01 / THE TRAJECTORY</div><h2>A little closer. One decision at a time.</h2></div><a className="text-link" href="#/methodology">Understand the scale <Arrow diagonal /></a></div><Timeline incidents={dataset.incidents} clock={dataset.clock} currentRemainingSeconds={dataset.remainingSeconds} /></section>
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
        <p>Three checks. Five amplifiers.<br />Every score explained.</p>
        <a className="text-link manifesto-source-link" href={FRAMEWORK_REPOSITORY_URL} target="_blank" rel="noopener noreferrer" aria-label="Read the method on GitHub (opens in a new tab)">
          <svg className="manifesto-source-glow" viewBox="0 0 320 120" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="github-ribbon-colour"><stop stopColor="#ec3029" stopOpacity="0" /><stop offset=".16" stopColor="#ff503b" stopOpacity=".8" /><stop offset=".46" stopColor="#ea251f" stopOpacity=".5" /><stop offset="1" stopColor="#ec3029" stopOpacity="0" /></linearGradient>
              <radialGradient id="github-ribbon-bloom"><stop stopColor="#ef382a" stopOpacity=".22" /><stop offset="1" stopColor="#ef382a" stopOpacity="0" /></radialGradient>
              <filter id="github-ribbon-soften" x="-20%" y="-100%" width="140%" height="300%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="3.5" /></filter>
            </defs>
            <ellipse cx="30" cy="66" rx="28" ry="20" fill="url(#github-ribbon-bloom)" />
            <path d={`${githubRibbon} C280 104 254 102 220 98 C189 94 172 97 142 99 C108 114 72 108 50 77 C30 52 10 46 -12 59Z`} fill="url(#github-ribbon-colour)" opacity=".22" />
            <path d={githubRibbon} stroke="url(#github-ribbon-colour)" strokeWidth="5" opacity=".55" filter="url(#github-ribbon-soften)" />
            <path d={githubRibbon} stroke="url(#github-ribbon-colour)" strokeWidth="1" />
          </svg>
          {/* GitHub mark from Primer Octicons; MIT licence in public/licenses/github-octicons.txt. */}
          <svg className="manifesto-github-mark" width="28" height="28" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" /></svg>
          <span className="manifesto-source-label"><strong>Read the method</strong><span>on GitHub</span></span><Arrow diagonal />
        </a>
      </div>
      <div className="manifesto-framework">
        <a className="text-link" href="#/methodology">Explore the methodology <Arrow diagonal /></a>
      </div>
    </section>
  </>;
}

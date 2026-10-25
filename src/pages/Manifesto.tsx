import { Arrow } from '../components/Shared';
import ImageCredit from '../components/ImageCredit';
import darkHallway from '../../assets/optimized/dark-hallway.webp';
import darkHallwayLarge from '../../assets/optimized/dark-hallway-large.webp';
import './manifesto.css';

// Author-supplied copy. Preserve wording, punctuation and paragraph boundaries.
const paragraphs = [
  `AI is exciting and terrifying in equal measure, with potential to both kill and cure us all. No one sane is building Skynet on purpose. There's no lair, white cat, glowing red eye, or master plan. Well-governed, controllable AI could be humanity's saviour. While having no evil master plan is reassuring, the lack of global AI governance could also be our existential undoing.`,
  `In a world where the AI frontier labs are racing each other to create artificial deities, they are both begging for investment and pleading for regulation against their own self-interest. In the same world where Washington and Beijing are competing for unilateral advantage, fighting over chips and vying for a new world order, the middle powers are poised to exploit any slip-up. As we lurch towards ever more isolationist, protectionist geopolitics, humanity is the one thing nobody is protecting, and no one has a hand on the brake.`,
  `Meanwhile in boardrooms and bedrooms across the world, we're all in it for ourselves. Founders chasing infamy. Investors chasing unicorns. Managers chasing a raise. Devs chasing GitHub stars and everyone else chasing the pack. While hype cycles fuel the chase, we just ship the tickets in front of us because the rent won't pay itself.`,
  `Not every idea has merit, but every decision makes sense, in isolation, only to the person making it. Building the boss's vanity agent. Bringing clients' bad ideas to life just to keep the pipeline alive. Skipping the red-teaming to hit the launch date. Giving the agent prod credentials because the demo needs them. Parking safety in the backlog under "nice to have".`,
  `Add it all up and we’re counting down to the end of our time. We tend to leave a wake of destruction behind us, but thankfully we haven’t yet gone all the way. Even so, our hands are already full, limiting the damage from some pretty big problems: nuclear war and climate change. Uncontrollable AI will be one disaster too far. And time is running out to turn back the clock.`,
  `So we're keeping count of every frontier model development, release and incident. Reckless releases, skipped evals, over-privileged agents: every act of irresponsibility moves the hand towards midnight. Every responsible call winds it back. Two minutes to midnight is the event horizon, the point of no return. Midnight is when we've lost control and AI has become our overlord.`,
  `Of course there'll be events we cannot see, and some that only reveal themselves when it's too late. We don't know what we don't know, but what we do know we can track and trace. The Skynet Countdown, our AI control and consequences clock if you like, is our contribution to the case for human responsibility over individual and collective irresponsibility. IMD's AI Safety Clock already puts us at fifteen metaphorical minutes to midnight. Take away the last two, the point of no return, and that leaves an unlucky thirteen minutes of theoretical time we really shouldn't be playing with.`,
];

export default function Manifesto() {
  return (
    <article className="manifesto-page container" aria-labelledby="manifesto-heading" data-analytics-area="manifesto">
      <header className="manifesto-hero">
        <div className="manifesto-hero-copy">
          <div className="manifesto-kicker eyebrow"><span className="manifesto-mark" aria-hidden="true" />The manifesto</div>
          <h1 id="manifesto-heading"><span>The future </span><span>is not <em>set.</em></span></h1>
        </div>
        <figure className="manifesto-hero-visual">
          <div className="manifesto-atmosphere">
            <img
              src={darkHallway}
              srcSet={`${darkHallway} 800w, ${darkHallwayLarge} 1600w`}
              sizes="(max-width: 600px) 140vw, (max-width: 1333px) 72vw, 960px"
              alt=""
              width="800"
              height="1120"
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <ImageCredit filename="Dark Hallway Red Light.jpg" />
        </figure>
      </header>

      <div className="manifesto-essay">
        <div className="manifesto-deck">
          <span className="manifesto-margin-mark" aria-hidden="true">↳</span>
          <h2>With great power comes great <span>irresponsibility.</span></h2>
        </div>
        <div className="manifesto-paragraphs">
          {paragraphs.map((paragraph, index) => (
            <div className={`manifesto-passage${index === 5 ? ' manifesto-passage-turn' : ''}`} key={paragraph}>
              <p>{paragraph}</p>
            </div>
          ))}
        </div>
        <div className="manifesto-endmark" aria-hidden="true"><span />◆<span /></div>
        <nav className="manifesto-next" aria-label="Continue exploring">
          <a className="text-link" href="#/">Back to the clock <Arrow /></a>
          <a className="text-link" href="#/methodology">Read the methodology <Arrow diagonal /></a>
        </nav>
      </div>
    </article>
  );
}

import { useEffect, useRef, useState } from 'react';
import { dataset } from './data';
import { Arrow, Logo } from './components/Shared';
import Home from './pages/Home';
import Archive from './pages/Archive';
import Incident from './pages/Incident';
import Methodology from './pages/Methodology';

function readRoute() { return window.location.hash.slice(1) || '/'; }

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const onHashChange = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); main.current?.focus({ preventScroll: true }); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const incident = route.startsWith('/incidents/') ? dataset.incidents.find((item) => item.id === route.slice('/incidents/'.length)) : undefined;
  useEffect(() => {
    document.title = `${incident?.headline ?? (route === '/methodology' ? 'The Methodology' : route === '/incidents' ? 'The Incident Archive' : 'The future is not set.')} — The Skynet Countdown`;
  }, [route, incident]);
  let page;
  if (dataset.diagnostics.length) page = <section className="container empty-state"><div className="eyebrow">DATA VALIDATION</div><h1>The record needs a review.</h1><p>The imported files contain unresolved records. The clock is withheld until the data passes validation.</p><details><summary>Review {dataset.diagnostics.length} source import issue{dataset.diagnostics.length === 1 ? '' : 's'}</summary><ul>{dataset.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic}</li>)}</ul></details></section>;
  else if (route === '/') page = <Home dataset={dataset} />;
  else if (route === '/incidents') page = <Archive dataset={dataset} />;
  else if (incident) page = <Incident incident={incident} />;
  else if (route === '/methodology') page = <Methodology dataset={dataset} />;
  else page = <section className="container empty-state"><div className="eyebrow">404 / NO SIGNAL</div><h1>This report isn’t on the record.</h1><p>The link may be out of date. The archive is still here.</p><a className="button button-primary" href="#/incidents">Return to the archive <Arrow /></a></section>;
  return <><a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a><header className="site-header"><div className="container header-inner"><Logo /><nav aria-label="Main navigation"><a href="#/" aria-current={route === '/' ? 'page' : undefined}>The clock</a><a href="#/incidents" aria-current={route.startsWith('/incidents') ? 'page' : undefined}>Incident archive</a><a href="#/methodology" aria-current={route === '/methodology' ? 'page' : undefined}>Methodology</a></nav><div className="header-status"><span /> INDEPENDENT. BY DESIGN.</div></div></header><main id="main-content" ref={main} tabIndex={-1}>{page}</main><footer className="site-footer"><div className="container footer-main"><div><Logo /><p>A practitioner-built record of AI, oversight,<br />and the space between the two.</p></div><div className="footer-links"><a href="#/incidents">The evidence <Arrow diagonal /></a><a href="#/methodology">The methodology <Arrow diagonal /></a><span>BUILT BY HUMANS. SO FAR.</span></div></div><div className="container footer-bottom"><span>© 2026 THE SKYNET COUNTDOWN</span><span>AN EDITORIAL INDEX. NOT A PROBABILITY OR A PREDICTION.</span><span>NO AFFILIATION WITH THE ROBOT APOCALYPSE.</span></div></footer></>;
}

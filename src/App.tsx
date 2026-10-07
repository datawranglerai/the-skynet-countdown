import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDataset } from './data';
import type { Dataset } from './lib/types';
import { Arrow, Logo, SupportLink } from './components/Shared';
import Soundtrack, { SoundtrackCredit } from './components/Soundtrack';
import Home from './pages/Home';
import Archive from './pages/Archive';
import Incident from './pages/Incident';
import Methodology from './pages/Methodology';

function readRoute() { return window.location.hash.slice(1) || '/'; }
const EMPTY_DATASET_ERROR = 'The live dataset contains no incidents.';

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [dataset, setDataset] = useState<Dataset>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const main = useRef<HTMLElement>(null);
  const datasetRef = useRef<Dataset | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const requestController = useRef<AbortController | null>(null);

  const refreshDataset = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const hasDataset = Boolean(datasetRef.current);
    if (hasDataset) setRefreshing(true);
    else setLoading(true);
    const activeController = new AbortController();
    requestController.current = activeController;
    const request = fetchDataset(activeController.signal)
      .then((nextDataset) => {
        if (!nextDataset.incidents.length) throw new Error(EMPTY_DATASET_ERROR);
        datasetRef.current = nextDataset;
        setDataset(nextDataset);
        setLoadError(undefined);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : 'The dataset could not be loaded.');
      })
      .finally(() => {
        if (inFlight.current !== request) return;
        setLoading(false);
        setRefreshing(false);
        inFlight.current = null;
        requestController.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    const onHashChange = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }); main.current?.focus({ preventScroll: true }); };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    void refreshDataset();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshDataset();
    };
    const interval = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      requestController.current?.abort();
      requestController.current = null;
      inFlight.current = null;
    };
  }, [refreshDataset]);

  const incident = route.startsWith('/incidents/') ? dataset?.incidents.find((item) => item.id === route.slice('/incidents/'.length)) : undefined;
  useEffect(() => {
    document.title = `${incident?.headline ?? (route === '/methodology' ? 'The Methodology' : route === '/incidents' ? 'The Incident Archive' : 'The future is not set.')} — The Skynet Countdown`;
  }, [route, incident]);
  let page;
  if (!dataset && loading) page = <section className="container empty-state data-state" aria-live="polite"><div className="eyebrow">LIVE RECORD / CONNECTING</div><h1>Loading the evidence.</h1><p>The latest incident record is being retrieved.</p><span className="data-state-pulse" aria-hidden="true" /></section>;
  else if (!dataset && loadError === EMPTY_DATASET_ERROR) page = <section className="container empty-state data-state" role="status"><div className="eyebrow">LIVE RECORD / EMPTY</div><h1>No incidents are on the record yet.</h1><p>The clock will appear when the first reviewed event is available.</p><button className="button button-primary" type="button" onClick={() => void refreshDataset()}>Check again <Arrow /></button></section>;
  else if (!dataset) page = <section className="container empty-state data-state" role="alert"><div className="eyebrow">LIVE RECORD / UNAVAILABLE</div><h1>The record is temporarily out of reach.</h1><p>The clock needs the live dataset before it can be shown. Please try again.</p><button className="button button-primary" type="button" onClick={() => void refreshDataset()}>Retry connection <Arrow /></button></section>;
  else if (dataset.diagnostics.length) page = <section className="container empty-state"><div className="eyebrow">DATA VALIDATION</div><h1>The record needs a review.</h1><p>The database contains unresolved records. The clock is withheld until the data passes validation.</p><details><summary>Review {dataset.diagnostics.length} source import issue{dataset.diagnostics.length === 1 ? '' : 's'}</summary><ul>{dataset.diagnostics.map((diagnostic, index) => <li key={index}>{diagnostic}</li>)}</ul></details></section>;
  else if (route === '/') page = <Home dataset={dataset} />;
  else if (route === '/incidents') page = <Archive dataset={dataset} />;
  else if (incident) page = <Incident incident={incident} />;
  else if (route === '/methodology') page = <Methodology dataset={dataset} />;
  else page = <section className="container empty-state"><div className="eyebrow">404 / NO SIGNAL</div><h1>This report isn’t on the record.</h1><p>The link may be out of date. The archive is still here.</p><a className="button button-primary" href="#/incidents">Return to the archive <Arrow /></a></section>;
  return <><a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a><header className="site-header"><div className="container header-inner"><Logo /><nav aria-label="Main navigation"><a href="#/" aria-current={route === '/' ? 'page' : undefined}>The clock</a><a href="#/incidents" aria-current={route.startsWith('/incidents') ? 'page' : undefined}>Incident archive</a><a href="#/methodology" aria-current={route === '/methodology' ? 'page' : undefined}>Methodology</a></nav><Soundtrack /></div></header><main id="main-content" ref={main} tabIndex={-1}>{dataset && loadError && <aside className="data-stale-notice" role="alert"><div><strong>Live update unavailable.</strong><span>Showing the last successfully loaded record{dataset.dataUpdatedAt ? `, current to ${new Date(dataset.dataUpdatedAt).toLocaleString('en-GB')}` : ''}.</span></div><button type="button" onClick={() => void refreshDataset()} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry now'}</button></aside>}{page}</main><footer className="site-footer"><div className="container footer-main"><div><Logo /><p>A practitioner-built record of AI, oversight,<br />and the space between the two.</p><SupportLink /></div><div className="footer-links"><a href="#/incidents">The evidence <Arrow diagonal /></a><a href="#/methodology">The methodology <Arrow diagonal /></a><span>BUILT BY HUMANS. SO FAR.</span></div></div><SoundtrackCredit /><div className="container footer-bottom"><span>© 2026 THE SKYNET COUNTDOWN</span><span>AN EDITORIAL INDEX. NOT A PROBABILITY OR A PREDICTION.</span><span>NO AFFILIATION WITH THE ROBOT APOCALYPSE.</span></div></footer></>;
}

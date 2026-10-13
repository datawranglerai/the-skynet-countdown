interface AnalyticsHit {
  path: string;
  title: string;
  referrer: string;
  event?: true;
  no_session?: true;
}

declare global {
  interface Window {
    goatcounter?: { count: (hit: AnalyticsHit) => void };
  }
}

const ENDPOINT = 'https://skynetcountdown.goatcounter.com/count';
const PRODUCTION_HOSTS = ['skynetcountdown.org', 'www.skynetcountdown.org'];
let status: 'disabled' | 'loading' | 'ready' | 'failed' = 'disabled';
let pending: AnalyticsHit[] = [];
let lastPage: string | undefined;

function send(hit: AnalyticsHit) {
  if (status === 'loading') {
    // Bound memory if a blocker leaves the script request pending indefinitely.
    if (pending.length < 50) pending.push(hit);
    return;
  }
  if (status !== 'ready') return;
  try {
    window.goatcounter?.count(hit);
  } catch {
    // Analytics must never interrupt navigation or an interaction.
  }
}

export function trackPageView(route: string, title: string) {
  const path = route === '/' ? '/' : `/#${route}`;
  if (path === lastPage) return;
  const referrer = lastPage ? `${window.location.origin}${lastPage}` : document.referrer.split(/[?#]/)[0];
  lastPage = path;
  send({ path, title, referrer });
}

export function trackEvent(path: string, title: string) {
  send({ path, title, event: true, no_session: true, referrer: `${window.location.origin}${lastPage ?? '/'}` });
}

function trackLink(event: MouseEvent) {
  if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link) return;
  const url = new URL(link.href);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  let destination: string;
  if (url.origin === window.location.origin) {
    if (!url.hash.startsWith('#/')) return; // Skip the accessibility focus link and in-page anchors.
    destination = url.hash.slice(1).split(/[?#]/)[0];
  } else {
    destination = `/${url.hostname}${url.pathname}`; // Never include outbound query strings or fragments.
  }

  const area = link.closest<HTMLElement>('[data-analytics-area]')?.dataset.analyticsArea ?? 'content';
  const label = (link.getAttribute('aria-label') || link.textContent || destination).replace(/\s+/g, ' ').trim().slice(0, 160);
  trackEvent(`click/${area}${destination}`, `Click (${area}): ${label}`);
}

/** Load once, before React mounts. Pageviews are sent explicitly after route resolution. */
export function initializeAnalytics() {
  if (status !== 'disabled' || !import.meta.env.PROD
    || !PRODUCTION_HOSTS.includes(window.location.hostname) || navigator.doNotTrack === '1') return;

  status = 'loading';
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = ENDPOINT;
  // React owns pageviews and delegated clicks; disable both automatic counters.
  script.dataset.goatcounterSettings = JSON.stringify({ no_onload: true, no_events: true });
  script.addEventListener('load', () => {
    status = 'ready';
    const queued = pending;
    pending = [];
    queued.forEach(send);
  }, { once: true });
  script.addEventListener('error', () => {
    status = 'failed';
    pending = [];
  }, { once: true });
  document.addEventListener('click', trackLink);
  document.addEventListener('auxclick', trackLink);
  document.head.append(script);
}

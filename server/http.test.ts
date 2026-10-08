import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApiServer, type ApiSnapshot } from './http.ts';

function fixture(): ApiSnapshot {
  return {
    dataset: {
      source: 'postgresql', generatedAt: '2026-09-29T10:00:00.000Z',
      incidents: [], assessmentCount: 0, editorialCount: 0, duplicateCount: 0,
      matchedEditorialCount: 0, diagnostics: [], totalPoints: 0,
      remainingSeconds: 900, pressure: 0, lastUpdated: '',
    },
    assessmentsCsv: 'cve_id,incident_title\r\n',
    storiesCsv: 'cve_id,headline\r\n',
  };
}

async function running(t: test.TestContext, loadSnapshot: () => Promise<ApiSnapshot>, cacheTtlMs = 30_000) {
  const server = createApiServer({ loadSnapshot, cacheTtlMs, allowedOrigins: ['https://skynetcountdown.org'] });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

test('API shares a bounded snapshot across concurrent reads, exports and readiness', async (t) => {
  let reads = 0;
  const value = fixture();
  const url = await running(t, async () => { reads++; return value; });
  const responses = await Promise.all([
    fetch(`${url}/dataset`, { headers: { Origin: 'https://skynetcountdown.org' } }),
    fetch(`${url}/exports/assessments.csv`),
    fetch(`${url}/exports/stories.csv`),
    fetch(`${url}/health`),
  ]);
  assert.ok(responses.every((response) => response.ok));
  assert.deepEqual(await responses[0].json(), value.dataset);
  assert.equal(responses[0].headers.get('access-control-allow-origin'), 'https://skynetcountdown.org');
  assert.equal(responses[0].headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await responses[1].text(), value.assessmentsCsv);
  assert.match(responses[1].headers.get('content-disposition')!, /attachment/);
  assert.equal(await responses[2].text(), value.storiesCsv);
  assert.deepEqual(await responses[3].json(), { status: 'ok' });
  assert.equal(reads, 1);

  const etag = responses[0].headers.get('etag')!;
  const unchanged = await fetch(`${url}/dataset`, { headers: { 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const head = await fetch(`${url}/dataset`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('API rejects cross-origin and write requests without reading the database', async (t) => {
  let reads = 0;
  const url = await running(t, async () => { reads++; return fixture(); });
  const forbidden = await fetch(`${url}/dataset`, { headers: { Origin: 'https://example.com' } });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(`${url}/dataset`, { method: 'POST', body: 'select secrets' })).status, 405);
  assert.equal((await fetch(`${url}/unknown`)).status, 404);
  const preflight = await fetch(`${url}/dataset`, { method: 'OPTIONS', headers: { Origin: 'https://skynetcountdown.org' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assert.equal(reads, 0);
});

test('API refreshes expired data and hides database errors instead of serving unlabelled stale data', async (t) => {
  let unavailable = false;
  let reads = 0;
  const value = fixture();
  const url = await running(t, async () => {
    reads++;
    if (unavailable) throw new Error('postgresql://owner:secret@private-host/db');
    return value;
  }, 0);
  assert.equal((await fetch(`${url}/dataset`)).status, 200);
  unavailable = true;
  const failure = await fetch(`${url}/dataset`);
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await failure.text(), /owner|secret|private-host|postgresql/);
  assert.equal((await fetch(`${url}/health`)).status, 503);
  unavailable = false;
  value.dataset.generatedAt = '2026-09-29T10:01:00.000Z';
  assert.equal((await (await fetch(`${url}/dataset`)).json()).generatedAt, value.dataset.generatedAt);
  assert.equal(reads, 4);
});

test('API withholds records with unresolved validation diagnostics', async (t) => {
  const value = fixture();
  value.dataset.diagnostics.push('Unreviewed identity conflict');
  const url = await running(t, async () => value);
  assert.equal((await fetch(`${url}/dataset`)).status, 503);
  assert.equal((await fetch(`${url}/exports/assessments.csv`)).status, 503);
});

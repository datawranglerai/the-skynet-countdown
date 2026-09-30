import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Dataset } from '../src/lib/types.ts';

export interface ApiSnapshot {
  dataset: Dataset;
  assessmentsCsv: string;
  storiesCsv: string;
}

interface ApiOptions {
  loadSnapshot: () => Promise<ApiSnapshot>;
  allowedOrigins: readonly string[];
  cacheTtlMs?: number;
  onError?: (error: unknown) => void;
}

interface CachedSnapshot {
  expiresAt: number;
  json: string;
  assessmentsCsv: string;
  storiesCsv: string;
}

export function createApiServer({ loadSnapshot, allowedOrigins, cacheTtlMs = 30_000, onError }: ApiOptions) {
  const origins = new Set(allowedOrigins);
  let cached: CachedSnapshot | undefined;
  let pending: Promise<CachedSnapshot> | undefined;

  async function snapshot(): Promise<CachedSnapshot> {
    if (cached && cached.expiresAt > Date.now()) return cached;
    if (!pending) {
      pending = loadSnapshot().then((value) => {
        if (value.dataset.diagnostics.length) throw new Error('The dataset failed validation');
        cached = {
          expiresAt: Date.now() + cacheTtlMs,
          json: JSON.stringify(value.dataset),
          assessmentsCsv: value.assessmentsCsv,
          storiesCsv: value.storiesCsv,
        };
        return cached;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  }

  function reply(request: IncomingMessage, response: ServerResponse, status: number, body: string, contentType = 'application/json; charset=utf-8') {
    response.statusCode = status;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Length', Buffer.byteLength(body));
    response.end(request.method === 'HEAD' ? undefined : body);
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Vary', 'Origin');
    response.setHeader('Cache-Control', 'no-store');

    const origin = request.headers.origin;
    if (origin && !origins.has(origin)) {
      reply(request, response, 403, JSON.stringify({ error: 'Origin not allowed' }));
      return;
    }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);

    let pathname: string;
    try { pathname = new URL(request.url ?? '/', 'http://localhost').pathname; }
    catch {
      reply(request, response, 400, JSON.stringify({ error: 'Invalid request URL' }));
      return;
    }
    if (!['/dataset', '/health', '/exports/assessments.csv', '/exports/stories.csv'].includes(pathname)) {
      reply(request, response, 404, JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Accept, If-None-Match');
      response.setHeader('Access-Control-Max-Age', '600');
      response.writeHead(204).end();
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      request.resume();
      response.setHeader('Allow', 'GET, HEAD, OPTIONS');
      reply(request, response, 405, JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const current = await snapshot();
      if (pathname === '/health') {
        reply(request, response, 200, JSON.stringify({ status: 'ok' }));
        return;
      }
      const csv = pathname.endsWith('.csv');
      const body = pathname === '/dataset' ? current.json
        : pathname === '/exports/assessments.csv' ? current.assessmentsCsv : current.storiesCsv;
      const etag = `"${createHash('sha256').update(body).digest('hex')}"`;
      response.setHeader('ETag', etag);
      response.setHeader('Access-Control-Expose-Headers', 'ETag, Content-Disposition');
      response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      if (request.headers['if-none-match'] === etag) {
        response.writeHead(304).end();
        return;
      }
      if (csv) {
        const name = pathname === '/exports/assessments.csv' ? 'assessments' : 'stories';
        response.setHeader('Content-Disposition', `attachment; filename="skynet-${name}.csv"`);
      }
      reply(request, response, 200, body, csv ? 'text/csv; charset=utf-8' : undefined);
    } catch (error) {
      onError?.(error);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '10');
      reply(request, response, 503, JSON.stringify({ error: 'The latest record is temporarily unavailable. Please try again.' }));
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

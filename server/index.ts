import { createApiServer } from './http.ts';
import { createPostgresPool, readDatabaseSnapshot } from './postgres.ts';
import { buildDatabaseDataset, exportDatabaseCsv } from './dataset.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to start the API');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'https://skynetcountdown.org,https://www.skynetcountdown.org')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://127.0.0.1:5173', 'http://localhost:5173');
}

const pool = createPostgresPool(databaseUrl);
const server = createApiServer({
  allowedOrigins,
  loadSnapshot: async () => {
    const snapshot = await readDatabaseSnapshot(pool);
    return {
      dataset: buildDatabaseDataset(snapshot),
      assessmentsCsv: exportDatabaseCsv(snapshot, 'assessments'),
      storiesCsv: exportDatabaseCsv(snapshot, 'stories'),
    };
  },
  onError: () => { console.error('Dataset read failed; returning a temporary-unavailability response.'); },
});

server.on('error', () => {
  console.error('The API could not start listening. Check the port configuration.');
  void pool.end().finally(() => { process.exitCode = 1; });
});
server.listen(port, '0.0.0.0', () => { console.log(`Skynet API listening on port ${port}`); });

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000);
  deadline.unref();
  server.close(() => {
    void pool.end().finally(() => { clearTimeout(deadline); });
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

import { fileURLToPath } from 'node:url';
import { buildDatabaseDataset } from '../server/dataset.ts';
import { createPostgresPool, readDatabaseSnapshot } from '../server/postgres.ts';

export async function checkPostgres(connectionString: string): Promise<{
  events: number; assessmentVersions: number; storyVersions: number; totalPoints: number; diagnostics: string[];
}> {
  const pool = createPostgresPool(connectionString);
  try {
    const snapshot = await readDatabaseSnapshot(pool);
    const dataset = buildDatabaseDataset(snapshot);
    return {
      events: dataset.incidents.length,
      assessmentVersions: dataset.assessmentCount,
      storyVersions: dataset.editorialCount,
      totalPoints: dataset.totalPoints,
      diagnostics: dataset.diagnostics,
    };
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const result = await checkPostgres(connectionString);
  if (result.diagnostics.length > 0) throw new Error(result.diagnostics.join('\n'));
  console.log(`${result.events} events · ${result.assessmentVersions} assessment versions · ${result.storyVersions} story versions · ${result.totalPoints} points`);
}


import { Pool, types as pgTypes, type PoolConfig } from 'pg';
import type {
  DatabaseAssessmentRow,
  DatabaseEventRow,
  DatabaseHistoryRow,
  DatabaseSnapshot,
  DatabaseStoryRow,
  Queryable,
  TransactionPool,
} from './storage-types.ts';

const SNAPSHOT_TIMEOUT_MS = 8_000;
pgTypes.setTypeParser(1082, (value) => value);

export function createPostgresPool(connectionString: string, overrides: Partial<PoolConfig> = {}): Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL');
  const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'channel_binding', 'options']) {
    url.searchParams.delete(key);
  }
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: isLoopback ? false : { rejectUnauthorized: true },
    enableChannelBinding: !isLoopback,
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ...overrides,
  });
  pool.on('error', () => console.error('An idle PostgreSQL connection closed unexpectedly.'));
  return pool;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  throw new TypeError('Expected a database timestamp');
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  throw new TypeError('Expected a database date');
}

function normalize(row: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const key of ['id', 'event_id', 'assessment_id', 'selected_assessment_id', 'selected_story_id', 'source_row_id']) {
    if (result[key] !== undefined && result[key] !== null) result[key] = String(result[key]);
  }
  for (const key of ['created_at', 'updated_at', 'recorded_at']) {
    if (result[key] !== undefined && result[key] !== null) result[key] = iso(result[key]);
  }
  if (result.incident_date !== undefined) result.incident_date = dateOnly(result.incident_date);
  return result;
}

export async function readDatabaseSnapshotFromClient(client: Queryable): Promise<DatabaseSnapshot> {
    const events = await client.query<DatabaseEventRow>('SELECT * FROM public.events ORDER BY id');
    const assessments = await client.query<DatabaseAssessmentRow>('SELECT * FROM public.assessments ORDER BY id');
    const stories = await client.query<DatabaseStoryRow>('SELECT * FROM public.stories ORDER BY id');
    const history = await client.query<DatabaseHistoryRow>('SELECT * FROM public.record_history ORDER BY recorded_at, id');
    const updated = await client.query<{ data_updated_at: Date | string }>(`
        SELECT COALESCE(NULLIF(GREATEST(
          COALESCE((SELECT MAX(updated_at) FROM public.events), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM public.assessments), '-infinity'::timestamptz),
          COALESCE((SELECT MAX(updated_at) FROM public.stories), '-infinity'::timestamptz)
        ), '-infinity'::timestamptz), CURRENT_TIMESTAMP) AS data_updated_at
      `);
    const dataUpdatedAt = updated.rows[0]?.data_updated_at;
    if (!dataUpdatedAt) throw new Error('Database snapshot has no update timestamp');
    return {
      events: events.rows.map((row) => normalize(row) as unknown as DatabaseEventRow),
      assessments: assessments.rows.map((row) => normalize(row) as unknown as DatabaseAssessmentRow),
      stories: stories.rows.map((row) => normalize(row) as unknown as DatabaseStoryRow),
      history: history.rows.map((row) => normalize(row) as unknown as DatabaseHistoryRow),
      dataUpdatedAt: iso(dataUpdatedAt),
    };
}

export async function readDatabaseSnapshot(pool: TransactionPool): Promise<DatabaseSnapshot> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${SNAPSHOT_TIMEOUT_MS}ms'`);
    const snapshot = await readDatabaseSnapshotFromClient(client);
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

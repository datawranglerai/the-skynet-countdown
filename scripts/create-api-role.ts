import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPostgresPool } from '../server/postgres.ts';

const ROLE_NAME = 'skynet_api_reader';
const OUTPUT_PATH = new URL('../.env.railway.local', import.meta.url);

export async function createApiRole(connectionString: string): Promise<void> {
  try {
    await access(OUTPUT_PATH);
    throw new Error('The Railway credential file already exists; reuse it instead of rotating the password.');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  const pool = createPostgresPool(connectionString);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE_NAME]);
    if (existing.rowCount) throw new Error('The API role already exists. Retrieve its existing credential instead of replacing it.');
    const database = decodeURIComponent(url.pathname.slice(1)).replaceAll('"', '""');
    const password = randomBytes(32).toString('hex');
    // The role name is fixed and the password contains hexadecimal characters only.
    await client.query(`CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '${password}'`);
    await client.query(`ALTER ROLE ${ROLE_NAME} SET default_transaction_read_only = on`);
    await client.query(`GRANT CONNECT ON DATABASE "${database}" TO ${ROLE_NAME}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE_NAME}`);
    await client.query(`GRANT SELECT ON public.events, public.assessments, public.stories, public.record_history TO ${ROLE_NAME}`);
    url.username = ROLE_NAME;
    url.password = password;
    await writeFile(OUTPUT_PATH, `# Private Railway service variables. This file is ignored by Git.\nDATABASE_URL='${url.toString()}'\nCORS_ORIGINS=https://skynetcountdown.org,https://www.skynetcountdown.org\n`, { mode: 0o600, flag: 'wx' });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error('DATABASE_URL is required');
  try {
    await createApiRole(connection);
    console.log('Created the SELECT-only API role. Private service variables are in .env.railway.local.');
  } catch {
    console.error('API role setup did not complete. Check database permissions and whether the role or private credential file already exists.');
    process.exitCode = 1;
  }
}

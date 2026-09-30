import { readdir, readFile } from 'node:fs/promises';

async function checkDirectory(path: URL): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = new URL(entry.name, path);
    if (entry.isDirectory()) {
      await checkDirectory(new URL(`${entry.name}/`, path));
    } else if (/\.(?:html|js|css|json|map)$/.test(entry.name)) {
      const content = await readFile(file, 'utf8');
      for (const marker of ['DATABASE_URL', 'postgresql://', 'postgres://', 'Historical manifest', 'Anthropic Put an Exploit-Hunter', 'Skynet Countdown Log - assessments', 'Skynet Countdown Log - stories']) {
        if (content.includes(marker)) throw new Error(`Static build contains a server-only or archived-data marker in ${entry.name}`);
      }
    } else if (/^Skynet.*\.csv$/.test(entry.name)) {
      throw new Error('Static build includes archived CSV assets');
    }
  }
}

await checkDirectory(new URL('../dist/', import.meta.url));
console.log('Verified the static build contains no database credentials, historical manifest or archived CSV assets.');

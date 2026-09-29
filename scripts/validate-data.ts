import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDataset } from '../src/lib/index.ts';

const assessmentsPath = fileURLToPath(new URL('../data/Skynet Countdown Log - assessments.csv', import.meta.url));
const storiesPath = fileURLToPath(new URL('../data/Skynet Countdown Log - stories.csv', import.meta.url));
const dataset = loadDataset(readFileSync(assessmentsPath, 'utf8'), readFileSync(storiesPath, 'utf8'));

console.log(
  `${dataset.incidents.length} events · ${dataset.assessmentCount} assessment rows (${dataset.incidents.reduce((sum, incident) => sum + incident.assessments.length, 0)} distinct) · ${dataset.editorialCount} editorials · ${dataset.incidents.reduce((sum, incident) => sum + incident.assessment.score, 0)} raw / ${dataset.totalPoints} effective points`,
);

if (dataset.diagnostics.length > 0) {
  for (const diagnostic of dataset.diagnostics) console.error(`- ${diagnostic}`);
  process.exitCode = 1;
}

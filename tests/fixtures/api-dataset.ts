import { readFileSync } from 'node:fs';
import { loadDataset } from '../../src/lib/dataset.ts';
import type { Assessment, Dataset, Editorial } from '../../src/lib/types.ts';

export const assessmentCsvFixture = readFileSync(
  new URL('../../data/Skynet Countdown Log - assessments.csv', import.meta.url),
  'utf8',
);
export const storyCsvFixture = readFileSync(
  new URL('../../data/Skynet Countdown Log - stories.csv', import.meta.url),
  'utf8',
);

/** Build the browser fixture from immutable migration CSVs, then add database identities. */
export function makeApiDatasetFixture(): Dataset {
  const legacy = loadDataset(assessmentCsvFixture, storyCsvFixture);
  return {
    ...legacy,
    source: 'fixture',
    generatedAt: '2026-09-29T12:00:00.000Z',
    dataUpdatedAt: '2026-09-29T11:45:00.000Z',
    incidents: legacy.incidents.map((incident, incidentIndex) => {
      const assessmentVersions = incident.assessments.map((version, versionIndex) => ({
        ...version,
        versionId: `assessment-${incidentIndex + 1}-${versionIndex + 1}`,
      }));
      const editorialVersions = incident.editorials.map((version, versionIndex) => ({
        ...version,
        versionId: `editorial-${incidentIndex + 1}-${versionIndex + 1}`,
      }));
      const assessmentIndex = incident.assessments.indexOf(incident.assessment);
      const editorialIndex = incident.editorial ? incident.editorials.indexOf(incident.editorial) : -1;
      return {
        ...incident,
        publicId: `SKYNET-${incident.assessment.date.slice(0, 4)}-${String(incidentIndex + 1).padStart(4, '0')}`,
        assessment: assessmentVersions[assessmentIndex] as Assessment,
        assessments: assessmentVersions,
        editorial: editorialIndex >= 0 ? editorialVersions[editorialIndex] as Editorial : undefined,
        editorials: editorialVersions,
      };
    }),
  };
}

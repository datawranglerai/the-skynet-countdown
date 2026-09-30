import { stableContentFingerprint } from './csv.ts';
import type { Assessment, Editorial } from './types.ts';

export function assessmentFingerprint(
  cveId: string,
  date: string,
  sourceUrl: string,
  score: number,
  fullTrifecta: boolean,
): string {
  return stableContentFingerprint(['assessment', cveId, date, sourceUrl, score, fullTrifecta]);
}

export function editorialFingerprint(cveId: string, headline: string): string {
  return stableContentFingerprint(['editorial', cveId, headline]);
}

const CRITERION_KEYS = ['t1', 't2', 't3', 'governance', 'autonomy', 'erosion', 'sentience', 'physical'] as const;

export function assessmentContentFingerprint(assessment: Assessment, eventId = ''): string {
  return stableContentFingerprint([
    'assessment-content', eventId, assessment.cveId, assessment.title, assessment.date,
    assessment.sourceUrl, assessment.severity, assessment.score, assessment.legacyMinutes,
    assessment.fullTrifecta,
    ...CRITERION_KEYS.flatMap((key) => [assessment.scores[key], assessment.rationales[key]]),
    assessment.leadingIndicator, assessment.leadingNote, assessment.notes,
  ]);
}

export function editorialContentFingerprint(
  editorial: Editorial,
  identity: { eventId?: string; date?: string; sourceUrl?: string } = {},
): string {
  return stableContentFingerprint([
    'editorial-content', identity.eventId ?? '', identity.date ?? '', identity.sourceUrl ?? '',
    editorial.cveId, editorial.headline, editorial.severity, editorial.legacyDeltaLabel,
    editorial.legacyClockPosition, editorial.metadata, editorial.story, editorial.take,
  ]);
}

export function sourceDateAlias(date: string, sourceUrl: string): string {
  const url = new URL(sourceUrl.trim());
  url.protocol = 'https:';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  url.hash = '';
  if (url.port === '80' || url.port === '443') url.port = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  url.pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${date.trim()}|${url.toString()}`;
}

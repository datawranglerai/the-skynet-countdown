import type { Dataset } from './lib/types.ts';
import { decodeDataset } from './lib/api-response.ts';

const DEFAULT_DATASET_API_URL = 'https://api.skynetcountdown.org/dataset';
const DATASET_REQUEST_TIMEOUT_MS = 10_000;

export const DATASET_API_URL = import.meta.env.VITE_API_URL?.trim() || DEFAULT_DATASET_API_URL;

export function getDatasetExportUrl(kind: 'assessments' | 'stories') {
  const datasetUrl = new URL(DATASET_API_URL, window.location.origin);
  return new URL(`/exports/${kind}.csv`, datasetUrl).toString();
}

export async function fetchDataset(signal?: AbortSignal): Promise<Dataset> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(signal?.reason);
  if (signal?.aborted) abortRequest();
  else signal?.addEventListener('abort', abortRequest, { once: true });
  const timeout = window.setTimeout(() => {
    requestController.abort(new DOMException('Dataset request timed out.', 'TimeoutError'));
  }, DATASET_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(DATASET_API_URL, {
      signal: requestController.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Dataset request failed with status ${response.status}.`);
    return decodeDataset(await response.json());
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortRequest);
  }
}

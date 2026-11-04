// Bundled and precached, not fetched via remoteData: examples must open on a first offline load.

import { fetchFailure, HttpError } from '../app/remoteData';
import { KeyedError } from '../../i18n/keyedError';

export interface ExampleMeta {
  id: string;
  file: string;
  name: string;
  description: string | null;
  bytes: number;
}

interface ExampleIndex {
  generated: string;
  source: { repo: string; ref: string };
  examples: ExampleMeta[];
}

const BASE = `${import.meta.env.BASE_URL}examples/`;

let cached: Promise<ExampleMeta[]> | undefined;

async function get(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch (e) {
    throw fetchFailure(e, false);
  }
  if (!res.ok) throw new HttpError(res.status);
  return res;
}

export function loadExampleIndex(): Promise<ExampleMeta[]> {
  cached ??= (async () => {
    const res = await get('examples.generated.json');
    let index: ExampleIndex;
    try {
      index = (await res.json()) as ExampleIndex;
    } catch (e) {
      throw fetchFailure(e, false);
    }
    if (!Array.isArray(index?.examples)) throw new KeyedError('errors.remote.noExamples');
    return index.examples;
  })().catch((e) => {
    // Never cache a failure, or a transient miss disables examples for the session.
    cached = undefined;
    throw e;
  });
  return cached;
}

export async function fetchExample(file: string): Promise<ArrayBuffer> {
  const res = await get(file);
  try {
    return await res.arrayBuffer();
  } catch (e) {
    throw fetchFailure(e, false);
  }
}

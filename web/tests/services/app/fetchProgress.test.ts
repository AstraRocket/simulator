import { describe, it, expect, vi } from 'vitest';
import { fetchJsonStaged, readStreamWithProgress } from '../../../src/services/app/fetchProgress';

const chunked = (count: number, size: number) => {
  const state = { canceled: 0, pulled: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (state.pulled >= count) {
        c.close();
        return;
      }
      state.pulled += 1;
      c.enqueue(new Uint8Array(size));
    },
    cancel() {
      state.canceled += 1;
    },
  });
  return { stream, state };
};

describe('readStreamWithProgress', () => {
  it('reads a stream through and reports progress', async () => {
    const { stream } = chunked(4, 10);
    const seen: number[] = [];
    const out = await readStreamWithProgress(stream, 40, (p) => seen.push(p.loaded));
    expect(out.byteLength).toBe(40);
    expect(seen.at(-1)).toBe(40);
  });

  it('refuses a response past the cap', async () => {
    const { stream } = chunked(10, 100);
    await expect(readStreamWithProgress(stream, null, () => {}, 250)).rejects.toThrow(/too large/i);
  });

  it('CANCELS the stream when it refuses, rather than abandoning it', async () => {
    const { stream, state } = chunked(1000, 100);
    await expect(readStreamWithProgress(stream, null, () => {}, 250)).rejects.toThrow(/too large/i);
    expect(state.canceled).toBe(1);
    expect(state.pulled).toBeLessThan(10);
  });

  it('surfaces the size error even when canceling itself fails', async () => {
    // `cancel` can reject on a stream the network already errored.
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(100));
      },
      cancel() {
        throw new Error('cancel exploded');
      },
    });
    await expect(readStreamWithProgress(stream, null, () => {}, 50)).rejects.toThrow(/too large/i);
  });

  it('does not cancel a stream that finished within the cap', async () => {
    const { stream, state } = chunked(2, 10);
    await readStreamWithProgress(stream, 20, () => {}, 1000);
    expect(state.canceled).toBe(0);
  });

  it('reports progress before the first chunk, so a slow start shows something', async () => {
    const { stream } = chunked(1, 5);
    const onProgress = vi.fn();
    await readStreamWithProgress(stream, 5, onProgress);
    expect(onProgress.mock.calls[0]?.[0]).toMatchObject({ loaded: 0, total: 5 });
  });
});

describe('fetchJsonStaged', () => {
  const errors = {
    http: (s: number) => new Error(`http ${s}`),
    tooLarge: () => new Error('mine: too large'),
    fail: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
  };
  const budget = { ttfbMs: 1000, bodyMs: 1000, maxBytes: 4 };

  it('words a streamed reply over the cap as the caller words a declared one', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('[1,2,3,4,5]'));
        c.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body)),
    );
    try {
      await expect(fetchJsonStaged('x', {}, budget, errors)).rejects.toThrow('mine: too large');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('words a declared length over the cap the same way', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[1,2,3,4,5]', { headers: { 'content-length': '11' } })),
    );
    try {
      await expect(fetchJsonStaged('x', {}, budget, errors)).rejects.toThrow('mine: too large');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

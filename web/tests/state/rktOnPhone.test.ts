// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';

const s = () => useWorkspaceStore.getState();

/** jsdom has no matchMedia; the open path asks it whether this is a desktop window. */
const setWindow = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const file = (text: string): File =>
  ({ name: 'design.ork', arrayBuffer: async () => new TextEncoder().encode(text).buffer }) as unknown as File;

const RKT = '<?xml version="1.0"?><RockSimDocument><FileVersion>4</FileVersion></RockSimDocument>';

/**
 * RockSim import is left off a phone or tablet. The menu hides it, and the
 * `.ork` picker cannot stand in for it: the reader goes by the bytes, so a
 * `.rkt` handed to it is refused before it is read.
 */
describe('a RockSim file on a phone or tablet', () => {
  const loadOrk = vi.fn();

  beforeEach(() => {
    loadOrk.mockReset().mockRejectedValue(new Error('reached the reader'));
    vi.doMock('../../src/services/files/loadOrk', () => ({ loadOrk }));
    s().resetWorkspace();
  });

  afterEach(() => vi.doUnmock('../../src/services/files/loadOrk'));

  it('is refused at phone width, without being read', async () => {
    setWindow(false);
    await s().openOrkFile(file(RKT));
    expect(loadOrk).not.toHaveBeenCalled();
    expect(s().err).toMatch(/RockSim files open on a desktop computer only/);
  });

  it('reaches the reader on a desktop window', async () => {
    setWindow(true);
    await s().openOrkFile(file(RKT));
    expect(loadOrk).toHaveBeenCalledOnce();
  });

  it('leaves a .ork alone at phone width', async () => {
    setWindow(false);
    await s().openOrkFile(file('<?xml version="1.0"?><openrocket version="1.10"></openrocket>'));
    expect(loadOrk).toHaveBeenCalledOnce();
  });
});

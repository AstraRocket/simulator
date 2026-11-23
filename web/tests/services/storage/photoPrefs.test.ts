// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PHOTO_DEFAULTS, readPhotoSettings } from '../../../src/services/design/photoSettings';

// Read the same way the store reads an empty slot, angle wrapping included.
const DEFAULTS = readPhotoSettings({});

const load = async () => import('../../../src/services/storage/photoPrefs');

describe('photoPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("starts at desktop's defaults", async () => {
    const { photoPrefs } = await load();
    expect(photoPrefs()).toEqual(DEFAULTS);
  });

  it('keeps a change across a reload and tells listeners', async () => {
    const first = await load();
    const heard = vi.fn();
    first.subscribePhotoPrefs(heard);
    first.setPhotoPrefs({ ...PHOTO_DEFAULTS, smoke: !PHOTO_DEFAULTS.smoke });
    expect(heard).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const second = await load();
    expect(second.photoPrefs().smoke).toBe(!PHOTO_DEFAULTS.smoke);
  });

  it('ignores stored junk', async () => {
    localStorage.setItem('astra.photoStudio', '[1,2]');
    const { photoPrefs } = await load();
    expect(photoPrefs()).toEqual(DEFAULTS);
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { upgradeNotes, upgradePhotoStudio } from '../../../src/services/storage/photoStudioUpgrade';
import { keyedNote, noteList } from '../../../src/services/files/importNote';

// jsdom, because the old block is raw XML.

const PHOTO = '<photostudio><roll>0.5</roll><sunlight red="1" green="2" blue="3" alpha="4"/></photostudio>';
const tree = (extra: Partial<RocketTree>): RocketTree => ({ name: 'x', components: [], ...extra });

describe('a design opened before Photo Studio existed', () => {
  it('has its raw block read into the settings, and the rest of the unread elements kept', () => {
    const out = upgradePhotoStudio(tree({ docExtra: ['<docprefs/>', PHOTO] }));
    expect(out.photoStudio).toEqual({ roll: '0.5', sunlight: '1 2 3 4' });
    expect(out.docExtra).toEqual(['<docprefs/>']);
  });

  it('loses the raw block, so a save does not write it twice', () => {
    expect(upgradePhotoStudio(tree({ docExtra: [PHOTO] })).docExtra).toBeUndefined();
  });

  it('keeps settings it already has over the raw copy', () => {
    const out = upgradePhotoStudio(tree({ docExtra: [PHOTO], photoStudio: { roll: '1.0' } }));
    expect(out.photoStudio).toEqual({ roll: '1.0' });
    expect(out.docExtra).toBeUndefined();
  });

  it('is left alone with nothing to move', () => {
    const t = tree({ docExtra: ['<docprefs/>'] });
    expect(upgradePhotoStudio(t)).toBe(t);
  });
});

describe('its stored import note', () => {
  it('no longer says there is no editor for Photo Studio', () => {
    const notes = [keyedNote('importNote.noEditor', { items: noteList(['photostudio', 'docprefs']) }), 'other'];
    expect(upgradeNotes(notes)).toEqual([keyedNote('importNote.noEditor', { items: noteList(['docprefs']) }), 'other']);
  });

  it('is dropped when Photo Studio was all it named', () => {
    expect(upgradeNotes([keyedNote('importNote.noEditor', { items: noteList(['photostudio']) })])).toEqual([]);
  });

  it('comes back as the same list when there is nothing to change', () => {
    const notes = [keyedNote('importNote.noEditor', { items: noteList(['docprefs']) })];
    expect(upgradeNotes(notes)).toBe(notes);
  });
});

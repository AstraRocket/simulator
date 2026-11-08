// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { RocketTree } from '../../../src/engine/openRocketEngine';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { designNotesXml, readDesignNotes } from '../../../src/services/files/ork/orkDesignNotes';
import { KNOWN_ROCKET_TAGS } from '../../../src/services/files/ork/passthrough';

const rocketWith = (inner: string): Element =>
  new DOMParser().parseFromString(`<rocket>${inner}</rocket>`, 'application/xml').documentElement;

const tree = (extra: Partial<RocketTree>): RocketTree => ({ components: [], ...extra });

describe('design notes in a .ork', () => {
  it('round-trips, escaping what XML would choke on', () => {
    const notes = {
      kitManufacturer: 'A&B <Rockets>',
      kitPartNumber: 'K-1',
      revisionLog: [{ id: 'a', date: '2026-11-03', note: 'New "fins" & paint' }],
    };
    const xml = designNotesXml(tree(notes));
    expect(xml).not.toBeNull();
    expect(readDesignNotes(rocketWith(xml as string))).toEqual(notes);
  });

  it('survives a whole file, and a second save writes it once', () => {
    const notes = {
      kitManufacturer: 'A&B',
      kitPartNumber: 'K-1',
      revisionLog: [{ id: 'a', date: '2026-11-03', note: 'Stretched <booster>' }],
    };
    const components = [
      {
        type: 'stage',
        id: 's',
        name: 'S',
        children: [{ type: 'bodytube', id: 'b', length: 0.3, outerRadius: 0.013 }],
      },
    ] as unknown as RocketTree['components'];
    const first = importOrk(exportOrk({ name: 'R', tree: tree({ components, ...notes }) }));
    expect(first.tree).toMatchObject(notes);
    const again = exportOrk({ name: 'R', tree: first.tree });
    expect(again.match(/<astrarocketnotes>/g)).toHaveLength(1);
  });

  it('writes nothing for a design without them', () => {
    expect(designNotesXml(tree({ designer: 'Ann', revisionLog: [] }))).toBeNull();
  });

  it('is a known rocket tag, so passthrough does not write it twice', () => {
    expect(KNOWN_ROCKET_TAGS.has('astrarocketnotes')).toBe(true);
  });

  it('reads nothing from a missing or malformed element', () => {
    expect(readDesignNotes(rocketWith(''))).toEqual({});
    expect(readDesignNotes(rocketWith('<astrarocketnotes>not json</astrarocketnotes>'))).toEqual({});
    expect(readDesignNotes(rocketWith('<astrarocketnotes>null</astrarocketnotes>'))).toEqual({});
  });

  it('keeps the good fields and entries of a damaged element, and only named fields', () => {
    const body = JSON.stringify({
      kitManufacturer: 7,
      kitPartNumber: 'K-1',
      other: 'x',
      revisionLog: [{ id: 'a', date: 'yesterday', note: 'n' }, 'junk', { id: 'b', date: '2026-01-02', note: 'ok' }],
    });
    expect(readDesignNotes(rocketWith(`<astrarocketnotes>${body}</astrarocketnotes>`))).toEqual({
      kitPartNumber: 'K-1',
      revisionLog: [{ id: 'b', date: '2026-01-02', note: 'ok' }],
    });
  });
});

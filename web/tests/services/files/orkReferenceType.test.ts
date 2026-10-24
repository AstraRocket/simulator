// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importOrk } from '../../../src/services/files/orkFile';
import { noteTexts } from '../../testing/importNotes';

/**
 * Desktop measures the stability margin in calibers against the reference the
 * design names (`<referencetype>`: nosecone, maximum, custom). The bridge
 * measures against the widest body tube whatever the file says, so a design
 * measured against anything else has to be told its margin can differ.
 */
const ork = (ref: string) =>
  `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.10" creator="test"><rocket><name>R</name>${ref}<subcomponents>
<stage><name>S</name><subcomponents>
<bodytube><name>B</name><length>0.3</length><radius>0.025</radius></bodytube>
</subcomponents></stage></subcomponents></rocket></openrocket>`;

const notes = (ref: string) => noteTexts(importOrk(ork(ref)).notes).filter((n) => n.includes('calibers'));

describe('a design measured against another reference', () => {
  it('is told its caliber margin can differ', () => {
    expect(notes('<referencetype>nosecone</referencetype>')).toEqual([
      'This design measures its stability in calibers against "nosecone". This app measures them against the widest body tube, so the stability margin in calibers can differ from desktop OpenRocket\'s; the file keeps the setting.',
    ]);
  });

  it('hears nothing when it is measured against the widest part, as the app is', () => {
    expect(notes('<referencetype>maximum</referencetype>')).toEqual([]);
    expect(notes('')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coverFit } from '../../../src/components/canvas/photo/customBackground';

const picture = (width: number, height: number) => new THREE.Texture({ width, height } as unknown as HTMLImageElement);

describe('your own background, cropped to fill the view', () => {
  it('crops the sides of a picture wider than the view, keeping its middle', () => {
    const t = picture(400, 100);
    coverFit(t, 2);
    expect(t.repeat.toArray()).toEqual([0.5, 1]);
    expect(t.offset.toArray()).toEqual([0.25, 0]);
  });

  it('crops the top and bottom of a picture taller than the view', () => {
    const t = picture(100, 200);
    coverFit(t, 1);
    expect(t.repeat.toArray()).toEqual([1, 0.5]);
    expect(t.offset.toArray()).toEqual([0, 0.25]);
  });

  it('leaves a picture the shape of the view whole', () => {
    const t = picture(300, 200);
    coverFit(t, 1.5);
    expect(t.repeat.toArray()).toEqual([1, 1]);
    expect(t.offset.toArray()).toEqual([0, 0]);
  });
});

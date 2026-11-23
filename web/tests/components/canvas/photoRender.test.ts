import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PHOTO_DEFAULTS } from '../../../src/services/design/photoSettings';
import { photoCamera, rocketPose, sunDirection } from '../../../src/components/canvas/photo/photoRender';

// The geometry of desktop's `PhotoPanel`, which the photo must share for a file's settings to frame the same picture.

const near = (...xyz: number[]) => xyz.map((v) => expect.closeTo(v, 9));

describe('the camera', () => {
  it('sits at (−d·sin az·cos alt, d·sin alt, d·cos az·cos alt) looking at the middle', () => {
    const s = { ...PHOTO_DEFAULTS, viewAz: 0.7, viewAlt: 0.3, viewDistance: 2 };
    const cam = photoCamera(s, 1.5, 1);
    expect(cam.position.toArray()).toEqual(
      near(-2 * Math.sin(0.7) * Math.cos(0.3), 2 * Math.sin(0.3), 2 * Math.cos(0.7) * Math.cos(0.3)),
    );
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(ahead.toArray()).toEqual(near(...cam.position.clone().normalize().negate().toArray()));
  });

  it('keeps going past straight overhead, its up turning with it', () => {
    const cam = photoCamera({ ...PHOTO_DEFAULTS, viewAz: 0, viewAlt: 2, viewDistance: 1 }, 1, 1);
    // Over the top, the camera is upside down.
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).y).toBeLessThan(0);
  });

  it('takes the field of view as desktop stores it, in radians', () => {
    expect(photoCamera({ ...PHOTO_DEFAULTS, fov: Math.PI / 3 }, 1, 1).fov).toBeCloseTo(60, 9);
  });
});

describe('the sun', () => {
  it('shines from (−cos alt·cos az, sin alt, −cos alt·sin az)', () => {
    expect(sunDirection({ ...PHOTO_DEFAULTS, lightAlt: 0.35, lightAz: -1 }).toArray()).toEqual(
      near(-Math.cos(0.35) * Math.cos(-1), Math.sin(0.35), -Math.cos(0.35) * Math.sin(-1)),
    );
  });
});

describe('the rocket', () => {
  it('is centered on its middle, moved by the advance, then pitched, yawed and rolled', () => {
    const m = rocketPose({ ...PHOTO_DEFAULTS, pitch: 0, yaw: 0, roll: 0, advance: 0.1 }, 0.5);
    expect(new THREE.Vector3(0.6, 0, 0).applyMatrix4(m).toArray()).toEqual(near(0, 0, 0));
    const pitched = rocketPose({ ...PHOTO_DEFAULTS, pitch: Math.PI / 2, yaw: 0, roll: 0, advance: 0 }, 0);
    // Pitch turns about Z by its negative: the aft end (+X) swings down.
    expect(new THREE.Vector3(1, 0, 0).applyMatrix4(pitched).toArray()).toEqual(near(0, -1, 0));
  });
});

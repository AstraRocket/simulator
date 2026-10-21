// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ROCKET_MODEL_NAME, rocketSvg } from '../../../src/components/canvas/rocketSvgExport';
import type { ExportData } from '../../../src/services/exports/schematicExport';

/** A scene shaped like the 3D view's: lights, the named rocket group, and a marker beside it. */
function scene() {
  const s = new THREE.Scene();
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  s.add(ambient, new THREE.DirectionalLight(0xffffff, 0.5));
  const branch = new THREE.Group();
  const model = new THREE.Group();
  model.name = ROCKET_MODEL_NAME;
  model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhongMaterial({ color: 0xff0000 })));
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0000ff }));
  branch.add(model, marker);
  s.add(branch);
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  camera.position.set(2, 2, 4);
  camera.lookAt(0, 0, 0);
  return { s, ambient, marker, camera };
}

const data = {
  name: 'Test rocket',
  info: null,
  units: { length: 'cm', mass: 'g' },
  withMotors: false,
  appVersion: '0',
  t: (k: string) => k,
} as unknown as ExportData;

describe('the 3D view as SVG', () => {
  it('draws the rocket as polygons under the design header', () => {
    const { s, camera } = scene();
    const svg = rocketSvg(s, camera, 2, data);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('Test rocket');
    expect(svg).toMatch(/<path[^>]*d="M/);
    // The box's faces, shaded from its red paint.
    expect(svg).toMatch(/fill:rgb\(\d+,0,0\)/);
  });

  it('leaves out what is not the rocket, a marker sprite here', () => {
    const { s, marker, camera } = scene();
    const svg = rocketSvg(s, camera, 2, data);
    // A sprite draws as a filled rect in its own color.
    expect(svg).not.toMatch(/fill:rgb\(0,0,255\)/);
    expect(marker.visible).toBe(true);
  });

  it('puts the live scene back as it was', () => {
    const { s, ambient, camera } = scene();
    const before = ambient.color.getHex();
    rocketSvg(s, camera, 2, data);
    expect(ambient.color.getHex()).toBe(before);
  });
});

import * as THREE from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import { svgWithHeader, type ExportData } from '../../services/exports/schematicExport.js';

export const ROCKET_MODEL_NAME = 'rocket-model';

const SVG_EXPORT_WIDTH = 1920;

/** CG/CP sprites are hidden because `SVGRenderer` draws them as blank squares. */
export function rocketSvg(scene: THREE.Scene, camera: THREE.Camera, aspect: number, d: ExportData): string {
  const width = SVG_EXPORT_WIDTH;
  const height = Math.round(width / aspect);
  const model = scene.getObjectByName(ROCKET_MODEL_NAME);
  const keep = new Set<THREE.Object3D>();
  model?.traverse((o) => keep.add(o));
  model?.traverseAncestors((o) => keep.add(o));

  const hidden: THREE.Object3D[] = [];
  const ambient: [THREE.AmbientLight, THREE.Color][] = [];
  scene.traverse((o) => {
    if (keep.has(o)) return;
    if (o instanceof THREE.AmbientLight) {
      // `SVGRenderer` ignores ambient intensity, washing the model out.
      ambient.push([o, o.color.clone()]);
      o.color.multiplyScalar(o.intensity);
      return;
    }
    if ((o as THREE.Light).isLight) return;
    if (o.visible && o.parent && keep.has(o.parent)) {
      o.visible = false;
      hidden.push(o);
    }
  });

  let inner: string;
  try {
    const renderer = new SVGRenderer();
    renderer.setClearColor(new THREE.Color(1, 1, 1), 1);
    renderer.setSize(width, height);
    renderer.render(scene, camera);
    const serializer = new XMLSerializer();
    // The renderer's viewBox is centered; the header expects one from the origin.
    inner =
      `<g transform="translate(${width / 2} ${height / 2})">` +
      Array.from(renderer.domElement.childNodes, (n) => serializer.serializeToString(n)).join('') +
      '</g>';
  } finally {
    for (const o of hidden) o.visible = true;
    for (const [light, color] of ambient) light.color.copy(color);
  }
  return svgWithHeader(inner, width, height, d, (px) => `${px}`);
}

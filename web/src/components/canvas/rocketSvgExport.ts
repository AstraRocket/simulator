import * as THREE from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import { svgWithHeader, type ExportData } from '../../services/exports/schematicExport.js';

/** The name of the group RocketModel draws the rocket in, which the SVG export keeps. */
export const ROCKET_MODEL_NAME = 'rocket-model';

/** The SVG export's width in its own units; it is vector, so this sets the proportions and the header size only. */
const SVG_EXPORT_WIDTH = 1920;

/**
 * The 3D model as an SVG document, from `camera`, under the same header band
 * the 2D schematic's SVG carries.
 *
 * The WebGL view is pixels, so this draws the scene again with three.js's
 * `SVGRenderer`: every visible triangle becomes one flat-shaded polygon,
 * sorted back to front. What that renderer cannot do is left out rather than
 * faked: there is no specular term, so shine does not show, and it ignores
 * clipping planes, so a cutaway is drawn closed. Only the rocket is kept; the
 * CG and CP markers are textured sprites it would draw as blank squares, and
 * the header states both numbers.
 *
 * The scene is the live one, edited for the length of one synchronous render
 * and put back before returning, so no frame can see it changed.
 */
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
      // `SVGRenderer` adds an ambient light's color at full strength, ignoring
      // its intensity, which washes the model out; scaled for the render.
      ambient.push([o, o.color.clone()]);
      o.color.multiplyScalar(o.intensity);
      return;
    }
    if ((o as THREE.Light).isLight) return;
    // The topmost object off the rocket's branch; its children go with it.
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
    // The renderer draws around the origin (its viewBox is centered); the
    // header expects a box from the origin.
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

import * as THREE from 'three';

// A T-slot extrusion's section on a unit square (1010 or 1515 alike, scaled): each face has a slot whose lips leave
// a narrow opening over a wider channel. Kept apart from each other: the channels stop short of the corner region.
const HALF = 0.5;
const OPENING = 0.13;
const LIP = 0.09;
const CHANNEL = 0.22;
const DEPTH = 0.26;
const BORE = 0.08;

/** One face, left to right along y = HALF, without its closing corner. */
const FACE: readonly [number, number][] = [
  [-HALF, HALF],
  [-OPENING, HALF],
  [-OPENING, HALF - LIP],
  [-CHANNEL, HALF - LIP],
  [-CHANNEL, HALF - DEPTH],
  [CHANNEL, HALF - DEPTH],
  [CHANNEL, HALF - LIP],
  [OPENING, HALF - LIP],
  [OPENING, HALF],
];

/** The section, clockwise: each face is the last turned a quarter clockwise. */
export function railSection(): THREE.Shape {
  const points: THREE.Vector2[] = [];
  for (let k = 0; k < 4; k++) {
    for (const [x, y] of FACE) {
      // A quarter turn clockwise, k times: (x, y) to (y, -x).
      let p: [number, number] = [x, y];
      for (let i = 0; i < k; i++) p = [p[1], -p[0]];
      points.push(new THREE.Vector2(p[0], p[1]));
    }
  }
  const shape = new THREE.Shape(points);
  shape.holes.push(new THREE.Path().absarc(0, 0, BORE, 0, Math.PI * 2, true));
  return shape;
}

/** A rail `side` wide and `length` long, standing along +y and centered on the origin. */
export function railGeometry(side: number, length: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(railSection(), { depth: length, bevelEnabled: false, curveSegments: 12 });
  // Extruded along +z from 0: stand it along +y, centered, at its width.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -length / 2, 0);
  geometry.scale(side, 1, side);
  return geometry;
}

const INCH = 0.0254;

/** As sold: 1010 (an inch) for a rail up to 2 m, 1515 past that. */
export const railSide = (lengthM: number): number => (lengthM > 2 ? 1.5 : 1) * INCH;

/** As sold: an eighth of an inch to a quarter, the longer the thicker. Radius, meters. */
export const rodRadius = (lengthM: number): number =>
  ((lengthM > 1.5 ? 0.25 : lengthM > 0.95 ? 0.1875 : 0.125) * INCH) / 2;

/** A launch pad's size, meters: how far its legs reach, how high its hub stands, and where the guide stands from. */
export interface PadStand {
  reach: number;
  height: number;
  /** The deflector's or mounting plate's thickness. */
  plate: number;
  /** The top of the deflector or plate: where the guide, and the rocket on it, stand. */
  top: number;
}

/**
 * As pads are sold: a model rocket pad's legs reach about half a meter, a high power pad's a meter and more, the
 * longer the rod or rail the bigger the pad. The hub stands a little under half the reach.
 */
export function padStand(guideLengthM: number): PadStand {
  const reach = Math.min(1.2, Math.max(0.4, guideLengthM * 0.35));
  const height = reach * 0.42;
  const plate = reach * 0.025;
  return { reach, height, plate, top: height + plate };
}

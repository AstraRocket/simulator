import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GROUND_ROTATION, configureTileTexture, groundMapLayout } from '../../../src/components/canvas/FlightGroundMap';
import { buildFlightScene, sceneFromEnu } from '../../../src/components/canvas/flightScene';
import type { FlightResult } from '../../../src/engine/openRocketEngine';
import { TILE_SIZE } from '../../../src/services/map/slippyMap';
import { MIN_EXTENT_M } from '../../../src/services/flight/groundTrack';

// Tile rows count southward while the scene counts north.

const HOME = { lat: 39.05, lon: -104.8 };
const UNITS_PER_METER = 24 / 271;
/** Meters from the pad. */
const RADIUS = 360;

const layout = () => groundMapLayout(HOME.lat, HOME.lon, RADIUS, UNITS_PER_METER, 'satellite');

describe('groundMapLayout', () => {
  it('covers the ground it was asked for, in tiles of the same scale', () => {
    const { quad, refs } = layout();
    expect(refs.length).toBeGreaterThan(1);

    // `visibleTiles` covers pixels 0 to width-1, so the last column can fall a pixel short.
    const reach = RADIUS * UNITS_PER_METER - quad / TILE_SIZE;
    const east = refs.map((r) => r.east);
    const north = refs.map((r) => r.north);
    expect(Math.max(...east) + quad / 2).toBeGreaterThanOrEqual(reach);
    expect(Math.min(...east) - quad / 2).toBeLessThanOrEqual(-reach);
    expect(Math.max(...north) + quad / 2).toBeGreaterThanOrEqual(reach);
    expect(Math.min(...north) - quad / 2).toBeLessThanOrEqual(-reach);

    expect(quad).toBeGreaterThan(0);
    expect(refs.every((r) => Number.isFinite(r.east) && Number.isFinite(r.north))).toBe(true);
  });

  // Tile rows grow southward: the smallest `y` must land at the greatest +z.
  it('puts northern tiles north, not south', () => {
    const { refs } = layout();
    const rows = [...new Set(refs.map((r) => r.y))].sort((a, b) => a - b);
    expect(rows.length).toBeGreaterThan(1);

    const northOf = (row: number) => refs.find((r) => r.y === row)!.north;
    expect(northOf(rows[0]!)).toBeGreaterThan(northOf(rows[rows.length - 1]!));
  });

  it('puts eastern tiles east', () => {
    const { refs } = layout();
    const cols = [...new Set(refs.map((r) => r.x))].sort((a, b) => a - b);
    expect(cols.length).toBeGreaterThan(1);

    const eastOf = (col: number) => refs.find((r) => r.x === col)!.east;
    expect(eastOf(cols[0]!)).toBeLessThan(eastOf(cols[cols.length - 1]!));
  });

  it('centers the ground on the pad', () => {
    const { quad, refs } = layout();
    const over = refs.filter((r) => Math.abs(r.east) <= quad / 2 && Math.abs(r.north) <= quad / 2);
    expect(over.length).toBeGreaterThan(0);
  });

  it('lays the quads edge to edge', () => {
    const { quad, refs } = layout();
    const cols = [...new Set(refs.map((r) => r.east.toFixed(6)))].map(Number).sort((a, b) => a - b);
    for (let i = 1; i < cols.length; i++) {
      expect(cols[i]! - cols[i - 1]!).toBeCloseTo(quad, 4);
    }
  });

  it('asks the layer it was given for its tiles', () => {
    expect(layout().refs.every((r) => r.url.includes('World_Imagery'))).toBe(true);
    const street = groundMapLayout(HOME.lat, HOME.lon, RADIUS, UNITS_PER_METER, 'street');
    expect(street.refs.every((r) => r.url.includes('World_Street_Map'))).toBe(true);
    // Never OpenStreetMap's own volunteer servers: see the note in slippyMap.ts.
    expect(street.refs.some((r) => r.url.includes('openstreetmap.org'))).toBe(false);
  });

  it('sends the user’s own key with every tile, and none without one', () => {
    expect(layout().refs.every((r) => !r.url.includes('token='))).toBe(true);
    const keyed = groundMapLayout(HOME.lat, HOME.lon, RADIUS, UNITS_PER_METER, 'satellite', 'test-key');
    expect(keyed.refs.length).toBeGreaterThan(0);
    expect(keyed.refs.every((r) => r.url.endsWith('?token=test-key'))).toBe(true);
  });

  it('zooms out for a wider flight rather than fetching more tiles', () => {
    const club = groundMapLayout(HOME.lat, HOME.lon, 200, UNITS_PER_METER, 'satellite');
    const big = groundMapLayout(HOME.lat, HOME.lon, 8_000, UNITS_PER_METER, 'satellite');
    expect(big.refs[0]!.z).toBeLessThan(club.refs[0]!.z);
    expect(big.refs.length).toBeLessThanOrEqual(club.refs.length * 2);
    expect(TILE_SIZE).toBe(256);
  });

  it('costs a modest number of tiles at any scale', () => {
    for (const radius of [MIN_EXTENT_M, 120, 360, 1_500, 20_000]) {
      const { refs } = groundMapLayout(HOME.lat, HOME.lon, radius, UNITS_PER_METER, 'satellite');
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.length).toBeLessThanOrEqual(25);
    }
  });
});

// three.js is right-handed with +y up, so east x north must come out up.
describe('scene basis', () => {
  const drift = (px: number[], py: number[]) => {
    const r = {
      summary: {},
      events: [],
      series: { time: [0, 1], altitude: [0, 10], velocity: [0, 0], Px: px, Py: py },
    } as unknown as FlightResult;
    const s = buildFlightScene(r, { boost: '#f00', coast: '#0f0', descent: '#00f' });
    const d = s.scenePts[1]!.clone().sub(s.scenePts[0]!);
    d.y = 0;
    return d.normalize();
  };

  it('puts the arc in a right-handed east-north-up frame', () => {
    const east = drift([0, 100], [0, 0]);
    const north = drift([0, 0], [0, 100]);
    const up = new THREE.Vector3().crossVectors(east, north);
    expect(up.y).toBeCloseTo(1, 9);
  });

  it('lays a tile’s top row (north) toward the arc’s north', () => {
    const tex = new THREE.Texture();
    configureTileTexture(tex);
    // With flipY the image's top row sits at the quad's +y; without, at -y.
    const top = new THREE.Vector3(0, tex.flipY ? 1 : -1, 0).applyEuler(new THREE.Euler(...GROUND_ROTATION));
    const north = sceneFromEnu(0, 0, 1);
    expect(top.distanceTo(north)).toBeCloseTo(0, 9);
  });

  it('places northern tiles where the arc puts north', () => {
    const { refs } = layout();
    const rows = [...new Set(refs.map((r) => r.y))].sort((a, b) => a - b);
    const at = (row: number) => {
      const r = refs.find((x) => x.y === row)!;
      return sceneFromEnu(r.east, 0, r.north);
    };
    const toward = at(rows[0]!)
      .sub(at(rows[rows.length - 1]!))
      .normalize();
    expect(toward.distanceTo(sceneFromEnu(0, 0, 1))).toBeCloseTo(0, 9);
  });
});

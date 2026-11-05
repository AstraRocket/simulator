// cspell:ignore Intermap METI NGCC
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import i18n from '../../../src/i18n';
import {
  MAX_LAT,
  panView,
  TILE_SIZE,
  TILE_SOURCES,
  formatCoord,
  formatLat,
  formatLon,
  latToTileY,
  lonToTileX,
  metersPerPixel,
  normalizeLon,
  project,
  tileXToLon,
  tileYToLat,
  unproject,
  visibleTiles,
  wrapTileX,
  zoomForMetersPerPixel,
} from '../../../src/services/map/slippyMap';

describe('tile projection', () => {
  it('puts the world corners where they are defined to be', () => {
    expect(lonToTileX(-180, 1)).toBeCloseTo(0, 12);
    expect(lonToTileX(0, 1)).toBeCloseTo(1, 12);
    expect(lonToTileX(180, 1)).toBeCloseTo(2, 12);

    expect(latToTileY(MAX_LAT, 1)).toBeCloseTo(0, 6);
    expect(latToTileY(0, 1)).toBeCloseTo(1, 12);
    expect(latToTileY(-MAX_LAT, 1)).toBeCloseTo(2, 6);
  });

  it('matches a hand-computed Mercator ordinate', () => {
    expect(latToTileY(45, 1)).toBeCloseTo(0.71945007, 7);
  });

  it('clamps past the poles rather than running to infinity', () => {
    expect(latToTileY(90, 4)).toBeCloseTo(latToTileY(MAX_LAT, 4), 9);
    expect(Number.isFinite(latToTileY(-90, 4))).toBe(true);
  });

  it('round-trips a coordinate through tile space', () => {
    for (const [lat, lon] of [
      [39.05, -104.8],
      [-33.87, 151.21],
      [0, 0],
      [60.17, 24.94],
    ] as const) {
      expect(tileYToLat(latToTileY(lat, 17), 17)).toBeCloseTo(lat, 9);
      expect(tileXToLon(lonToTileX(lon, 17), 17)).toBeCloseTo(lon, 9);
    }
  });

  it('reports the published ground resolution', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.034, 2);
    expect(metersPerPixel(0, 1)).toBeCloseTo(156543.034 / 2, 2);
    expect(metersPerPixel(60, 0)).toBeCloseTo(156543.034 * 0.5, 1);
  });
});

describe('wrapping', () => {
  it('folds a column back into the world', () => {
    expect(wrapTileX(-1, 3)).toBe(7);
    expect(wrapTileX(8, 3)).toBe(0);
    expect(wrapTileX(3, 3)).toBe(3);
  });

  it('folds a longitude into the readable range', () => {
    expect(normalizeLon(190)).toBeCloseTo(-170, 9);
    expect(normalizeLon(-190)).toBeCloseTo(170, 9);
    expect(normalizeLon(-104.8)).toBeCloseTo(-104.8, 9);
    expect(normalizeLon(180)).toBeCloseTo(-180, 9);
  });
});

describe('visibleTiles', () => {
  it('covers the viewport, and places each tile where it belongs', () => {
    const tiles = visibleTiles(0, 0, 2, 512, 512);
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t.left).toBeGreaterThan(-TILE_SIZE);
      expect(t.top).toBeGreaterThan(-TILE_SIZE);
      expect(t.left).toBeLessThan(512);
      expect(t.top).toBeLessThan(512);
    }
    const lefts = [...new Set(tiles.map((t) => t.left))].sort((a, b) => a - b);
    expect(lefts).toEqual([0, 256]);
  });

  it('drops rows off the top and bottom of the world, but wraps columns', () => {
    const tiles = visibleTiles(0, 0, 1, 512, 768);
    expect(tiles.every((t) => t.y >= 0 && t.y < 2)).toBe(true);
    expect(new Set(tiles.map((t) => t.y))).toEqual(new Set([0, 1]));

    const wide = visibleTiles(0, 0, 1, 1536, 256);
    expect(wide.length).toBeGreaterThan(2);
    expect(wide.every((t) => t.x >= 0 && t.x < 2)).toBe(true);
    expect(new Set(wide.map((t) => t.key)).size).toBe(wide.length);
  });
});

describe('project / unproject', () => {
  it('puts the center coordinate at the center of the box', () => {
    const p = project(39.05, -104.8, 39.05, -104.8, 15, 400, 300);
    expect(p.x).toBeCloseTo(200, 9);
    expect(p.y).toBeCloseTo(150, 9);
  });

  it('round-trips a click back to the coordinate under it', () => {
    const c = { lat: 39.05, lon: -104.8, z: 16, w: 400, h: 300 };
    const ll = unproject(320, 90, c.lat, c.lon, c.z, c.w, c.h);
    const back = project(ll.latitudeDeg, ll.longitudeDeg, c.lat, c.lon, c.z, c.w, c.h);
    expect(back.x).toBeCloseTo(320, 6);
    expect(back.y).toBeCloseTo(90, 6);
  });

  it('takes the short way around the date line', () => {
    const p = project(0, 179, 0, -179, 6, 400, 300);
    expect(p.x).toBeLessThan(200);
    expect(p.x).toBeGreaterThan(-400);
  });

  it('north is up and east is right', () => {
    const north = project(40, -104.8, 39.05, -104.8, 12, 400, 300);
    const east = project(39.05, -104, 39.05, -104.8, 12, 400, 300);
    expect(north.y).toBeLessThan(150);
    expect(east.x).toBeGreaterThan(200);
  });
});

describe('tile sources', () => {
  it('builds both paths in Esri z/y/x order', () => {
    // Esri is z/y/x, unlike most servers; backwards looks plausible but is misplaced.
    expect(TILE_SOURCES.satellite.url(15, 6844, 12534)).toContain('World_Imagery/MapServer/tile/15/12534/6844');
    expect(TILE_SOURCES.street.url(15, 6844, 12534)).toContain('World_Street_Map/MapServer/tile/15/12534/6844');
  });

  it('asks nobody’s volunteer tile servers', () => {
    // OSM's Tile Usage Policy bars third-party apps from its volunteer servers.
    for (const source of Object.values(TILE_SOURCES)) {
      expect(source.url(15, 1, 2)).not.toMatch(/openstreetmap\.org/);
      expect(source.url(15, 1, 2)).toMatch(/^https:\/\/server\.arcgisonline\.com\//);
    }
  });

  it('carries the attribution each service publishes', () => {
    expect(TILE_SOURCES.satellite.attribution).toBe(
      'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    );
    // Esri's street map is built on OSM data, so OSM contributors stay credited.
    expect(TILE_SOURCES.street.attribution).toBe(
      'Sources: Esri, HERE, Garmin, USGS, Intermap, INCREMENT P, NRCan, Esri Japan, METI, Esri China (Hong Kong), ' +
        'Esri Korea, Esri (Thailand), NGCC, (c) OpenStreetMap contributors, and the GIS User Community',
    );
  });
});

describe('formatCoord', () => {
  it('writes hemispheres rather than signs', () => {
    expect(formatCoord(39.05, -104.8)).toBe('39.0500° N, 104.8000° W');
    expect(formatCoord(-33.87, 151.21)).toBe('33.8700° S, 151.2100° E');
    expect(formatCoord(0, 0)).toBe('0.0000° N, 0.0000° E');
  });
});

describe('zoomForMetersPerPixel', () => {
  it('lands on the zoom nearest the drawing, in either direction', () => {
    for (const target of [0.4, 1.2, 7.5, 60, 400]) {
      const z = zoomForMetersPerPixel(39.05, target, 19);
      const off = (zz: number) => Math.abs(Math.log2(metersPerPixel(39.05, zz) / target));
      expect(off(z)).toBeLessThanOrEqual(off(z - 1));
      expect(off(z)).toBeLessThanOrEqual(off(z + 1));
    }
  });
  it('leaves a scale factor within a half step of exact', () => {
    for (const target of [0.3, 2, 33, 250]) {
      const k = metersPerPixel(39.05, zoomForMetersPerPixel(39.05, target, 19)) / target;
      expect(k).toBeGreaterThanOrEqual(Math.SQRT1_2);
      expect(k).toBeLessThanOrEqual(Math.SQRT2);
    }
  });

  it('stops where the provider runs out of imagery, and where the world does', () => {
    expect(zoomForMetersPerPixel(39.05, 0.0001, 19)).toBe(19);
    expect(zoomForMetersPerPixel(39.05, 1e9, 19)).toBe(1);
  });

  it('refuses to divide by a resolution of zero', () => {
    expect(Number.isFinite(zoomForMetersPerPixel(39.05, 0, 19))).toBe(true);
  });
});

describe('formatLat / formatLon', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('names the hemisphere instead of signing the number', () => {
    expect(formatLat(-33.87)).toBe('33.8700° S');
    expect(formatLon(-104.8, 5)).toBe('104.80000° W');
  });

  it('writes the digits in the reader locale', async () => {
    await i18n.changeLanguage('de');
    expect(formatCoord(39.05, -104.8, 3)).toBe('39,050° N, 104,800° W');
  });

  it('writes the hemisphere letters in the reader language', async () => {
    await i18n.changeLanguage('es');
    expect(formatCoord(39.05, -104.8, 3)).toBe('39,050° N, 104,800° O');
  });

  it('is the only way a view prints a coordinate', () => {
    const src = resolve(__dirname, '../../../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'vendor' && entry !== 'locales') walk(path);
        } else if (/\.tsx?$/.test(entry) && /toFixed\(\d\)\}\s?°/.test(readFileSync(path, 'utf8'))) {
          offenders.push(path.slice(src.length + 1));
        }
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe('panView', () => {
  it('moves the center east and south by a screen offset', () => {
    const v = panView({ lat: 0, lon: 0, zoom: 2 }, TILE_SIZE, 0);
    expect(v.lon).toBeCloseTo(90);
    expect(v.lat).toBeCloseTo(0);
  });

  it('wraps across the date line', () => {
    expect(panView({ lat: 0, lon: 170, zoom: 1 }, TILE_SIZE / 2, 0).lon).toBeCloseTo(-100);
  });

  it('stops at the pole rather than panning past it', () => {
    const v = panView({ lat: 80, lon: 0, zoom: 3 }, 0, -10 * TILE_SIZE);
    expect(v.lat).toBeCloseTo(MAX_LAT, 3);
  });
});

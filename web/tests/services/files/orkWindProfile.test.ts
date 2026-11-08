// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { exportOrk, importOrk } from '../../../src/services/files/orkFile';
import { specToTree, type RocketSpec } from '../../testing/specTree';
import type { LaunchConditions } from '../../../src/services/design/orkTree';

const spec = {
  noseCone: { length: 0.1, aftRadius: 0.013, thickness: 0.001 },
  bodyTube: { length: 0.2, outerRadius: 0.013, thickness: 0.0005 },
  fins: { count: 4, rootChord: 0.06, tipChord: 0.03, sweep: 0.03, height: 0.05, thickness: 0.003 },
  motorMount: { length: 0.07, outerRadius: 0.0092, thickness: 0.0004 },
  parachute: { diameter: 0.3 },
} as unknown as RocketSpec;

const { tree } = specToTree(spec);

const base: LaunchConditions = {
  launchRodLengthM: 1,
  launchRodAngleDeg: 0,
  windAverage: 4,
  windStdDev: 0.4,
  windDirectionDeg: 90,
  launchAltitudeM: 0,
  latitudeDeg: 28.61,
  longitudeDeg: -80.6,
  temperatureC: null,
  pressureHPa: null,
};

const roundTrip = (launch: LaunchConditions) => importOrk(exportOrk({ name: 'Wind', tree, launch })).launch;

describe('multilevel wind profile round-trips through .ork', () => {
  const profile: LaunchConditions = {
    ...base,
    windLevels: [
      { altitudeM: 0, speed: 4, directionDeg: 90, stddev: 0.4 },
      { altitudeM: 600, speed: 9, directionDeg: 120, stddev: 1.8 },
    ],
    windAltitudeReference: 'agl',
  };

  it('writes a multilevel wind element and selects it', () => {
    const xml = exportOrk({ name: 'Wind', tree, launch: profile });
    expect(xml).toContain('<wind model="multilevel" altituderef="agl">');
    expect(xml).not.toContain('<altitudereference>');
    expect(xml).toContain('<windmodeltype>Multilevel</windmodeltype>');
    expect(xml).toContain('<wind model="average">');
  });

  it('brings the levels back, with direction in degrees again', () => {
    const back = roundTrip(profile)?.windLevels ?? [];
    expect(back).toHaveLength(2);
    back.forEach((l, i) => {
      const want = profile.windLevels![i]!;
      expect(l.altitudeM).toBe(want.altitudeM);
      expect(l.speed).toBe(want.speed);
      expect(l.stddev).toBe(want.stddev);
      // The file stores radians, so a heading comes back a float epsilon off.
      expect(l.directionDeg).toBeCloseTo(want.directionDeg, 10);
    });
  });

  it('carries the altitude reference', () => {
    expect(roundTrip(profile)?.windAltitudeReference).toBe('agl');
    expect(roundTrip({ ...profile, windAltitudeReference: 'msl' })?.windAltitudeReference).toBe('msl');
  });

  it('writes MSL for a profile that never set a reference', () => {
    const { windAltitudeReference: _drop, ...noRef } = profile;
    expect(roundTrip(noRef)?.windAltitudeReference).toBe('msl');
  });

  it('reads a file that omits the attribute as MSL', () => {
    const xml = exportOrk({ name: 'Wind', tree, launch: profile }).replace(/ altituderef="agl"/, '');
    expect(importOrk(xml).launch?.windAltitudeReference).toBeUndefined();
  });

  it('reads the altitude reference from the attribute the desktop writes', () => {
    const desktop = (ref: string) =>
      `<openrocket version="1.10" creator="OpenRocket 24.12"><rocket><name>W</name><subcomponents><stage><name>S</name>` +
      `<subcomponents><bodytube><name>B</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents>` +
      `</stage></subcomponents></rocket><simulations><simulation status="notsimulated"><name>Simulation 1</name>` +
      `<simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator><conditions>` +
      `<wind model="average"><speed>2.0</speed><direction>1.5707963267948966</direction><standarddeviation>0.2</standarddeviation></wind>` +
      `<wind model="multilevel" altituderef="${ref}">` +
      `<windlevel altitude="0.0" speed="2.0" direction="1.5707963267948966" standarddeviation="0.2"/>` +
      `<windlevel altitude="500.0" speed="6.0" direction="2.0943951023931953" standarddeviation="1.2"/>` +
      `</wind><windmodeltype>MultiLevel</windmodeltype><atmosphere model="isa"/></conditions></simulation></simulations></openrocket>`;
    expect(importOrk(desktop('agl')).launch?.windAltitudeReference).toBe('agl');
    expect(importOrk(desktop('msl')).launch?.windAltitudeReference).toBe('msl');
    expect(importOrk(desktop('agl')).launch?.windLevels).toHaveLength(2);
  });

  it('reads the reference as a child element too', () => {
    const xml = exportOrk({ name: 'Wind', tree, launch: profile }).replace(
      ' altituderef="agl">',
      '><altitudereference>AGL</altitudereference>',
    );
    expect(importOrk(xml).launch?.windAltitudeReference).toBe('agl');
  });

  it('drops a level whose altitude the file does not give, rather than landing it on the pad', () => {
    const withBadLevels = (levels: string) =>
      `<openrocket version="1.10" creator="OpenRocket 24.12"><rocket><name>W</name><subcomponents><stage><name>S</name>` +
      `<subcomponents><bodytube><name>B</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents>` +
      `</stage></subcomponents></rocket><simulations><simulation status="notsimulated"><name>Simulation 1</name>` +
      `<simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator><conditions>` +
      `<wind model="multilevel" altituderef="msl">${levels}</wind>` +
      `<windmodeltype>MultiLevel</windmodeltype><atmosphere model="isa"/></conditions></simulation></simulations></openrocket>`;

    const missing = importOrk(
      withBadLevels(
        `<windlevel altitude="0.0" speed="2.0" direction="1.57" standarddeviation="0.2"/>` +
          `<windlevel speed="6.0" direction="2.09" standarddeviation="1.2"/>` +
          `<windlevel altitude="nonsense" speed="7.0" direction="2.09"/>` +
          `<windlevel altitude="500.0" speed="6.0" direction="2.09" standarddeviation="1.2"/>`,
      ),
    ).launch?.windLevels;
    expect(missing?.map((l) => l.altitudeM)).toEqual([0, 500]);
    const repeated = importOrk(
      withBadLevels(
        `<windlevel altitude="0.0" speed="2.0" direction="1.57"/>` +
          `<windlevel altitude="0.0" speed="9.0" direction="1.57"/>`,
      ),
    ).launch?.windLevels;
    expect(repeated).toHaveLength(1);
    expect(repeated![0]!.speed).toBe(2);
  });

  it('still writes the average model when there is no profile', () => {
    const xml = exportOrk({ name: 'Wind', tree, launch: base });
    expect(xml).toContain('<windmodeltype>Average</windmodeltype>');
    expect(xml).not.toContain('model="multilevel"');
    expect(roundTrip(base)?.windLevels).toBeUndefined();
  });

  it('keeps writing the legacy turbulence ratio for pre-24 desktops', () => {
    // 0.4 / 4 = 0.1, the intensity rather than the m/s deviation.
    expect(exportOrk({ name: 'Wind', tree, launch: base })).toContain('<windturbulence>0.1</windturbulence>');
  });
});

describe('a negative wind speed in a file', () => {
  it('reads as the wind the kernel flies', () => {
    const back = roundTrip({
      ...base,
      windAverage: -3,
      windModelType: 'multilevel',
      windLevels: [
        { altitudeM: 0, speed: -4, directionDeg: 90, stddev: 0 },
        { altitudeM: 500, speed: 6, directionDeg: 45, stddev: 0 },
      ],
    } as LaunchConditions);
    expect(back?.windAverage).toBeCloseTo(3, 9);
    // The average keeps its stated heading; a level flips it
    // (MultiLevelPinkNoiseWindModel.addWindLevel).
    expect(back?.windLevels?.[0]?.speed).toBeCloseTo(4, 9);
    expect(back?.windLevels?.[0]?.directionDeg).toBeCloseTo(270, 9);
    expect(back?.windLevels?.[1]?.speed).toBeCloseTo(6, 9);
  });
});

describe('a profile kept under the Average model', () => {
  const desktopAverage =
    `<openrocket version="1.10" creator="OpenRocket 24.12"><rocket><name>W</name><subcomponents><stage><name>S</name>` +
    `<subcomponents><bodytube><name>B</name><length>0.3</length><radius>0.012</radius></bodytube></subcomponents>` +
    `</stage></subcomponents></rocket><simulations><simulation status="notsimulated"><name>Simulation 1</name>` +
    `<simulator>RK4Simulator</simulator><calculator>BarrowmanCalculator</calculator><conditions>` +
    `<windaverage>2.0</windaverage><windturbulence>0.1</windturbulence><winddirection>1.5707963267948966</winddirection>` +
    `<wind model="average"><speed>2.0</speed><direction>1.5707963267948966</direction><standarddeviation>0.2</standarddeviation></wind>` +
    `<wind model="multilevel" altituderef="agl">` +
    `<windlevel altitude="0.0" speed="3.0" direction="1.5707963267948966" standarddeviation="0.3"/>` +
    `<windlevel altitude="500.0" speed="6.0" direction="2.0943951023931953" standarddeviation="1.2"/>` +
    `</wind><windmodeltype>Average</windmodeltype><atmosphere model="isa"/></conditions></simulation></simulations></openrocket>`;

  const fileLevels = [
    { altitudeM: 0, speed: 3, directionDeg: 90, stddev: 0.3 },
    { altitudeM: 500, speed: 6, directionDeg: 120, stddev: 1.2 },
  ];
  const expectLevels = (got: LaunchConditions['windLevels']) => {
    expect(got).toHaveLength(fileLevels.length);
    got!.forEach((l, i) => {
      const want = fileLevels[i]!;
      expect(l.altitudeM).toBe(want.altitudeM);
      expect(l.speed).toBe(want.speed);
      expect(l.stddev).toBe(want.stddev);
      expect(l.directionDeg).toBeCloseTo(want.directionDeg, 9);
    });
  };

  it('reads the profile without flying it', () => {
    const launch = importOrk(desktopAverage).launch;
    expect(launch?.windLevels).toBeUndefined();
    expectLevels(launch?.keptWindLevels);
    expect(launch?.windAverage).toBe(2);
  });

  it('writes the profile back with Average still selected', () => {
    const xml = exportOrk({ name: 'Wind', tree, launch: importOrk(desktopAverage).launch as LaunchConditions });
    expect(xml).toContain('<wind model="multilevel" altituderef="agl">');
    expect(xml.match(/<windlevel /g)).toHaveLength(2);
    expect(xml).toContain('<windmodeltype>Average</windmodeltype>');

    const back = importOrk(xml).launch;
    expect(back?.windLevels).toBeUndefined();
    expectLevels(back?.keptWindLevels);
    expect(back?.windAltitudeReference).toBe('agl');
  });

  it('takes the model from the last <wind> when the file has no <windmodeltype>', () => {
    const untyped = desktopAverage.replace('<windmodeltype>Average</windmodeltype>', '');
    const multi = importOrk(untyped).launch;
    expectLevels(multi?.windLevels);
    expect(multi?.keptWindLevels).toBeUndefined();

    const avgEl = untyped.match(/<wind model="average">.*?<\/wind>/)![0];
    const avgLast = untyped.replace(avgEl, '').replace('<atmosphere', `${avgEl}<atmosphere`);
    const avg = importOrk(avgLast).launch;
    expect(avg?.windLevels).toBeUndefined();
    expectLevels(avg?.keptWindLevels);
  });

  it('lets a later <wind> override an earlier <windmodeltype>', () => {
    const typedFirst = desktopAverage
      .replace('<windmodeltype>Average</windmodeltype>', '')
      .replace('<wind model="average">', '<windmodeltype>Average</windmodeltype><wind model="average">');
    // The multilevel <wind> closes last, so it wins.
    const launch = importOrk(typedFirst).launch;
    expect(launch?.keptWindLevels).toBeUndefined();
    expectLevels(launch?.windLevels);
  });

  it('flies the same profile once the file selects Multilevel', () => {
    const multi = desktopAverage.replace(
      '<windmodeltype>Average</windmodeltype>',
      '<windmodeltype>MultiLevel</windmodeltype>',
    );
    const launch = importOrk(multi).launch;
    expectLevels(launch?.windLevels);
    expect(launch?.keptWindLevels).toBeUndefined();
  });
});

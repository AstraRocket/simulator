import { describe, it, expect } from 'vitest';
import { parseWindProfileCsv, WindProfileCsvError } from '../../../src/services/flight/windProfileCsv';

const csv = (...rows: string[]) => rows.join('\n');

describe('parseWindProfileCsv', () => {
  it('reads the desktop convenience format', () => {
    const levels = parseWindProfileCsv(
      csv('altitude,speed,direction,stddev', '0,4,90,0.4', '500,8,110,1.2', '1000,12,130,2.4'),
    );
    expect(levels).toEqual([
      { altitudeM: 0, speed: 4, directionDeg: 90, stddev: 0.4 },
      { altitudeM: 500, speed: 8, directionDeg: 110, stddev: 1.2 },
      { altitudeM: 1000, speed: 12, directionDeg: 130, stddev: 2.4 },
    ]);
  });

  it('sorts by altitude however the file was ordered', () => {
    const levels = parseWindProfileCsv(csv('altitude,speed,direction,stddev', '900,9,90,0', '0,3,90,0', '300,5,90,0'));
    expect(levels.map((l) => l.altitudeM)).toEqual([0, 300, 900]);
  });

  it('treats the standard deviation as optional, column and cell alike', () => {
    expect(parseWindProfileCsv(csv('altitude,speed,direction', '0,4,90'))[0]!.stddev).toBe(0);
    expect(parseWindProfileCsv(csv('altitude,speed,direction,stddev', '0,4,90,'))[0]!.stddev).toBe(0);
  });

  it('floors a negative deviation at 0, as the kernel does', () => {
    const kernelFloor = (sd: number) => Math.max(sd, 0);
    for (const sd of [-0.0001, -0.5, -3, -1e6, 0, 0.25, 7]) {
      const [level] = parseWindProfileCsv(csv('altitude,speed,direction,stddev', `0,4,90,${sd}`));
      expect(level!.stddev, String(sd)).toBe(kernelFloor(sd));
    }
    const [level] = parseWindProfileCsv(csv('altitude;speed;direction;stddev', '0;-4;90;-1,5'));
    expect(level).toEqual({ altitudeM: 0, speed: 4, directionDeg: 270, stddev: 0 });
  });

  it('accepts semicolon and tab separated files', () => {
    expect(parseWindProfileCsv(csv('altitude;speed;direction', '0;4;90'))[0]!.speed).toBe(4);
    expect(parseWindProfileCsv(csv('altitude\tspeed\tdirection', '0\t4\t90'))[0]!.speed).toBe(4);
  });

  it('reads a decimal comma in a semicolon-separated file, as the desktop does', () => {
    expect(parseWindProfileCsv(csv('altitude;speed;direction;stddev', '100;5,5;270;0,5'))[0]).toEqual({
      altitudeM: 100,
      speed: 5.5,
      directionDeg: 270,
      stddev: 0.5,
    });
  });

  it('stores a negative speed as the wind from the opposite heading', () => {
    expect(parseWindProfileCsv(csv('altitude,speed,direction', '0,-4,270'))[0]).toEqual({
      altitudeM: 0,
      speed: 4,
      directionDeg: 90,
      stddev: 0,
    });
  });

  it('accepts the header spellings a sounding actually ships with', () => {
    const levels = parseWindProfileCsv(csv('Altitude MSL,Wind Speed,Heading,Std_Dev', '0,4,90,0.4'));
    expect(levels[0]).toEqual({ altitudeM: 0, speed: 4, directionDeg: 90, stddev: 0.4 });
  });

  it('survives a spreadsheet BOM on the first header', () => {
    expect(parseWindProfileCsv('﻿altitude,speed,direction\n0,4,90')).toHaveLength(1);
  });

  it('skips blank lines rather than failing on them', () => {
    expect(parseWindProfileCsv(csv('altitude,speed,direction', '0,4,90', '', '500,8,90', ''))).toHaveLength(2);
  });

  it('rejects a file with no usable columns', () => {
    expect(() => parseWindProfileCsv(csv('height,knots', '0,4'))).toThrow(WindProfileCsvError);
    try {
      parseWindProfileCsv(csv('height,knots', '0,4'));
    } catch (e) {
      expect((e as WindProfileCsvError).key).toBe('missingColumns');
    }
  });

  it('reports the line for a short or non-numeric row', () => {
    try {
      parseWindProfileCsv(csv('altitude,speed,direction', '0,4,90', '500,8'));
    } catch (e) {
      expect((e as WindProfileCsvError).key).toBe('shortRow');
      expect((e as WindProfileCsvError).line).toBe(3);
    }
    try {
      parseWindProfileCsv(csv('altitude,speed,direction', '0,brisk,90'));
    } catch (e) {
      expect((e as WindProfileCsvError).key).toBe('badNumber');
      expect((e as WindProfileCsvError).line).toBe(2);
    }
  });

  it('rejects an empty file and a header with no rows', () => {
    expect(() => parseWindProfileCsv('   ')).toThrow(/emptyFile/);
    expect(() => parseWindProfileCsv('altitude,speed,direction')).toThrow(/noData/);
  });
});

// `Number('')` is 0, so a blank required cell would otherwise import as a real 0.
describe('a blank cell in a required column', () => {
  it('fails the row rather than reading as 0 m/s', () => {
    expect(() => parseWindProfileCsv('altitude,speed,direction\n100,,90\n')).toThrow();
    expect(() => parseWindProfileCsv('altitude,speed,direction\n,5,90\n')).toThrow();
    expect(() => parseWindProfileCsv('altitude,speed,direction\n100,5,\n')).toThrow();
  });

  it('still treats a blank stddev as no scatter', () => {
    const levels = parseWindProfileCsv('altitude,speed,direction,stddev\n100,5,90,\n');
    expect(levels[0]!.stddev).toBe(0);
    expect(levels[0]!.speed).toBe(5);
  });
});

describe('the altitude reference the header names', () => {
  it('is agl for an AGL header and msl for an MSL one', () => {
    expect(parseWindProfileCsv(csv('altitude AGL,speed,direction', '0,4,90')).reference).toBe('agl');
    expect(parseWindProfileCsv(csv('altitude_agl (m),speed,direction', '0,4,90')).reference).toBe('agl');
    expect(parseWindProfileCsv(csv('Altitude MSL,Wind Speed,Heading', '0,4,90')).reference).toBe('msl');
  });

  it('is absent, not msl, for a header that says nothing', () => {
    const levels = parseWindProfileCsv(csv('altitude,speed,direction', '0,4,90'));
    expect(levels.reference).toBeUndefined();
    expect('reference' in levels).toBe(false); // no key at all, so toEqual on the array still holds
  });
});

describe('quoted headers and cells', () => {
  it('reads a header a spreadsheet quoted', () => {
    const levels = parseWindProfileCsv(
      csv('"altitude (m)","speed (m/s)","direction (deg)","stddev (m/s)"', '0,4,90,0.4'),
    );
    expect(levels).toEqual([{ altitudeM: 0, speed: 4, directionDeg: 90, stddev: 0.4 }]);
  });

  it('reads quoted numeric cells too', () => {
    const levels = parseWindProfileCsv(csv('altitude,speed,direction,stddev', '"100","5","90",""'));
    expect(levels).toEqual([{ altitudeM: 100, speed: 5, directionDeg: 90, stddev: 0 }]);
  });
});

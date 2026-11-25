import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { FlightEvent } from '../../../src/engine/openRocketEngine';
import { directedView, directorCuts } from '../../../src/components/canvas/flightDirector';
import { flightBranches } from '../../../src/services/flight/flightColumns';
import { flyTwoStage } from '../../testing/twoStageFlight';
import { buildTrack, type FlightTrack } from '../../../src/components/canvas/flightTrack';

const PAD = new THREE.Vector3();
const FLIGHT = { LIFTOFF: 0.1, LAUNCHROD: 0.3, BURNOUT: 2.3, APOGEE: 10, GROUND_HIT: 60 };
const events = (times: Partial<Record<FlightEvent['type'], number>>) =>
  Object.entries(times).map(([type, time]) => ({ type, time }) as FlightEvent);
/** Down `away` meters from the pad, at half a unit to the meter. */
const track = (away: number): FlightTrack => ({
  ...buildTrack([], 1, Infinity),
  scenePts: [PAD, new THREE.Vector3(away / 2, 0, 0)],
  times: [0, 60],
});
const cuts = (times: Partial<Record<FlightEvent['type'], number>>, away = 50) =>
  directorCuts(events(times), events(times), track(away), PAD, 0.5);
const views = (c: ReturnType<typeof cuts>) => c.map((k) => k.view);

describe('the director', () => {
  it('shows launch from the pad, boost from behind, the rest following, a near descent from the pad and the landing up close', () => {
    const c = cuts(FLIGHT);
    expect(views(c)).toEqual(['pad', 'chase', 'follow', 'pad', 'follow']);
    expect(directedView(c, 0)).toBe('pad');
    expect(directedView(c, 2.3)).toBe('chase');
    expect(directedView(c, 10)).toBe('follow');
    expect(directedView(c, 59)).toBe('pad');
    expect(directedView(c, 62)).toBe('follow');
  });

  it('follows a landing too far off to see from the pad', () => {
    expect(cuts(FLIGHT, 149)).toHaveLength(5);
    expect(views(cuts(FLIGHT, 151))).toEqual(['pad', 'chase', 'follow']);
  });

  it('chases through the last burn before apogee, and not one after it', () => {
    const last = events({ ...FLIGHT, APOGEE: 20 });
    last.push({ type: 'BURNOUT', time: 7 } as FlightEvent, { type: 'BURNOUT', time: 30 } as FlightEvent);
    const c = directorCuts(last, last, track(50), PAD, 0.5);
    expect(directedView(c, 1.2)).toBe('pad');
    expect(directedView(c, 1.4)).toBe('chase');
    expect(directedView(c, 7)).toBe('chase');
    expect(directedView(c, 8)).toBe('follow');
  });

  it('is following by apogee, with no shot too short to take in', () => {
    const low = cuts({ ...FLIGHT, BURNOUT: 0.9, APOGEE: 2.2, GROUND_HIT: 6 });
    expect(views(low)).toEqual(['pad', 'follow']);
    expect(directedView(low, 2.2)).toBe('follow');
    const quick = cuts({ ...FLIGHT, BURNOUT: 0.9, APOGEE: 4 });
    expect(views(quick).slice(0, 3)).toEqual(['pad', 'chase', 'follow']);
    expect(directedView(quick, 3.5)).toBe('follow');
  });

  it('follows a dropped stage, whose own record has no liftoff', async () => {
    const result = await flyTwoStage();
    const [first, booster] = flightBranches(result).map((b) => b.events ?? []);
    expect(booster!.some((e) => e.type === 'LIFTOFF')).toBe(false);
    const c = directorCuts(booster!, first!, track(50), PAD, 0.5);
    const apogee = booster!.find((e) => e.type === 'APOGEE')!.time;
    expect(directedView(c, 0)).toBe('pad');
    expect(directedView(c, apogee)).toBe('follow');
  });

  it('stays on the pad with a rocket that does', () => {
    expect(views(cuts({}))).toEqual(['pad']);
  });

  it('keeps following a run that stops before landing', () => {
    expect(views(cuts({ LIFTOFF: 0.1, LAUNCHROD: 0.3, BURNOUT: 2.3, APOGEE: 10 }))).toEqual(['pad', 'chase', 'follow']);
  });
});

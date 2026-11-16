import { describe, expect, it } from 'vitest';
import { simpleIssues, type SimpleFigures } from '../../../src/services/flight/simpleRocket';
import { MAIN_BAND } from '../../../src/services/flight/recoverySizing';

const calm: SimpleFigures = {
  railExit: 20,
  railTwr: 8,
  maxAcceleration: 100,
  burnoutTime: 1,
  burnoutAltitude: 50,
  apogee: 300,
  maxVelocity: 100,
  maxMach: 0.3,
  timeToApogee: 8,
  optimumDelay: 6,
  railStability: 1.5,
  deployVelocity: 5,
  landingVelocity: 4,
  flightTime: 40,
};
const limits = { railExitMin: 15, deployWarn: 20 };

describe('simpleIssues', () => {
  it('raises nothing for a sound flight', () => {
    expect(simpleIssues(calm, limits).size).toBe(0);
  });

  it('raises every rule in display order', () => {
    const bad = {
      ...calm,
      railExit: 10,
      maxMach: 0.9,
      railStability: 0.5,
      deployVelocity: 30,
      landingVelocity: MAIN_BAND.max + 1,
    };
    expect([...simpleIssues(bad, limits)]).toEqual(['slowExit', 'mach', 'stability', 'deployFast', 'hardLanding']);
  });

  it('raises nothing for a figure the flight did not produce', () => {
    const none = { ...calm, railStability: null, deployVelocity: null, landingVelocity: null };
    expect(simpleIssues(none, limits).size).toBe(0);
  });
});

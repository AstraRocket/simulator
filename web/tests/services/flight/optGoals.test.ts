import { describe, it, expect } from 'vitest';
import { domainDistance, pointScore, type OptPoint } from '../../../src/services/flight/optimizer/optGoals';

const figures = {
  apogee: 300,
  maxVelocity: 90,
  maxAcceleration: 120,
  groundHitVelocity: 5,
  deploymentVelocity: Number.NaN,
  landingDistance: 40,
  flightTime: 60,
};
const point = (distance: number): OptPoint => ({ static: { cp: 0.5, cg: 0.4, calibers: 2 }, distance, figures });

describe('optimizer scoring', () => {
  it('maximizes, minimizes and seeks as desktop goals do', () => {
    expect(pointScore(point(0), 'apogee', 'maximize', 0, 'calibers')).toBe(-300);
    expect(pointScore(point(0), 'landingDistance', 'minimize', 0, 'calibers')).toBe(40);
    expect(pointScore(point(0), 'apogee', 'seek', 250, 'calibers')).toBe(50);
  });

  it('reads stability from the static figures, in calibers or as the CP to CG length', () => {
    expect(pointScore(point(0), 'stability', 'maximize', 0, 'calibers')).toBe(-2);
    expect(pointScore(point(0), 'stability', 'minimize', 0, 'length')).toBeCloseTo(0.1);
  });

  it('scores any point outside the limits below every point inside, the further out the worse', () => {
    const inside = pointScore(point(0), 'apogee', 'minimize', 0, 'calibers');
    const near = pointScore(point(0.1), 'apogee', 'minimize', 0, 'calibers');
    const far = pointScore(point(2), 'apogee', 'minimize', 0, 'calibers');
    expect(inside).toBeLessThan(near);
    expect(near).toBeLessThan(far);
  });

  it('scores a figure the flight never reached, or a failed point, worst of all', () => {
    expect(pointScore(point(0), 'deploymentVelocity', 'minimize', 0, 'calibers')).toBe(Number.MAX_VALUE);
    expect(pointScore(null, 'apogee', 'minimize', 0, 'calibers')).toBe(Number.MAX_VALUE);
    expect(pointScore(point(Number.NaN), 'apogee', 'minimize', 0, 'calibers')).toBe(Number.MAX_VALUE);
  });

  it('measures how far outside the stability limits a design is', () => {
    const st = { cp: 0.5, cg: 0.4, calibers: 2 };
    expect(domainDistance(null, st)).toBeLessThan(0);
    expect(domainDistance({ min: 1, max: null, unit: 'calibers' }, st)).toBe(0);
    expect(domainDistance({ min: 3, max: null, unit: 'calibers' }, st)).toBe(1);
    expect(domainDistance({ min: null, max: 1.5, unit: 'calibers' }, st)).toBe(0.5);
    expect(domainDistance({ min: 0.2, max: null, unit: 'length' }, st)).toBeCloseTo(0.1);
  });
});

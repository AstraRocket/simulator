import { describe, it, expect } from 'vitest';
import i18n from '../../../src/i18n';
import { launcherKind, sharedLauncher, simLauncher, withLauncher } from '../../../src/services/design/launcher';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

const design = (...guides: string[]): RocketTree =>
  ({
    components: [
      {
        type: 'stage',
        children: [{ type: 'bodytube', children: guides.map((type) => ({ type })) }],
      },
    ],
  }) as unknown as RocketTree;

describe('launcherKind', () => {
  it("reads the launcher off the design's guides", () => {
    expect(launcherKind(design('railbutton', 'railbutton'))).toBe('rail');
    expect(launcherKind(design('launchlug'))).toBe('rod');
  });

  it('names neither when the design has no guide, or both kinds', () => {
    expect(launcherKind(design())).toBeNull();
    expect(launcherKind(design('launchlug', 'railbutton'))).toBeNull();
  });
});

describe("withLauncher, through the app's own i18next", () => {
  const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;

  it('picks the variant for the design, and the neutral word for none', () => {
    expect(withLauncher(t, 'rail')('sim.rodExit')).toBe('Rail exit');
    expect(withLauncher(t, 'rod')('sim.rodExit')).toBe('Rod exit');
    expect(withLauncher(t, null)('sim.rodExit')).toBe('Launcher exit');
  });

  it('keeps interpolation, and leaves keys without variants alone', () => {
    expect(withLauncher(t, 'rail')('limits.rodAngleHighPower', { value: '25°', limit: '20°' })).toBe(
      'Launch rail angle is 25° from vertical, above the 20° the NAR and Tripoli safety codes allow a high power rocket.',
    );
    expect(withLauncher(t, 'rail')('sim.apogee')).toBe(t('sim.apogee'));
  });
});

describe("a simulation's launcher", () => {
  const lugs = design('launchlug');

  it("is its own choice, else the design's", () => {
    expect(simLauncher({ launcher: 'rail' }, lugs)).toBe('rail');
    expect(simLauncher({}, lugs)).toBe('rod');
    expect(simLauncher(undefined, design())).toBeNull();
  });

  it('words a set of them by the one they share, neutral when they differ', () => {
    expect(sharedLauncher([{ launcher: 'rail' }, { launcher: 'rail' }], lugs)).toBe('rail');
    expect(sharedLauncher([{ launcher: 'rail' }, {}], lugs)).toBeNull();
    expect(sharedLauncher([{}, { launcher: 'rod' }], lugs)).toBe('rod');
    expect(sharedLauncher([], lugs)).toBe('rod');
  });

  it('turns the launcher text with it', () => {
    const t = withLauncher(i18n.t as unknown as (key: string) => string, sharedLauncher([{ launcher: 'rail' }], lugs));
    expect(t('launch.launchRod')).toBe('Launch rail');
  });
});

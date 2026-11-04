import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';
import type { StaticInfo } from '../../src/engine/openRocketEngine';

const s = () => useWorkspaceStore.getState();

const build = (mass: number) => ({
  info: { mass } as unknown as StaticInfo,
  rocket: {} as never,
});

describe('replaceWorkspace clears the live build', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('drops the outgoing info and handle', () => {
    const b = build(1.234);
    s().applyBuild(b.info, b.rocket);
    expect(s().info).not.toBeNull();

    s().resetWorkspace();
    expect(s().info).toBeNull();
    expect(s().rocket).toBeNull();
  });

  it('does not leak the old mass into the new design', () => {
    s().applyBuild(build(99).info, build(99).rocket);
    s().resetWorkspace();
    expect((s().info as { mass?: number } | null)?.mass).toBeUndefined();
  });

  it('clears the run state along with the build', () => {
    s().applyBuild(build(1).info, build(1).rocket);
    s().resetWorkspace();
    expect(s().simRuns).toEqual({});
    expect(s().lastRunIds).toEqual([]);
    expect(s().resultSimId).toBeNull();
    expect(s().selectedSimIds).toEqual([]);
    expect(s().simBusy).toBe(false);
    expect(s().driftSweep).toBeNull();
    expect(s().driftSweepRun).toBeNull();
    expect(s().err).toBeNull();
  });
});

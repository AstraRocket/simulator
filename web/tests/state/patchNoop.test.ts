import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from '../../src/state/store';
import { findNode, patchChangesNode } from '../../src/services/design/treeEdit';

const s = () => useWorkspaceStore.getState();

const unlinked = () => {
  const current = findNode(s().tree, 'nose')!.length as number;
  s().setSelectedId('nose');
  s().patchSelected({ length: current + 0.01 });
  s().patchSelected({ length: current });
  s().commitEdit();
  return s().tree;
};

describe('patchChangesNode', () => {
  beforeEach(() => {
    s().resetWorkspace();
  });

  it('is false for a patch that repeats the current value', () => {
    const current = findNode(unlinked(), 'nose')!.length as number;
    expect(patchChangesNode(unlinked(), 'nose', { length: current })).toBe(false);
  });

  it('is true for a patch that changes one key of several', () => {
    const current = findNode(unlinked(), 'nose')!.length as number;
    expect(patchChangesNode(unlinked(), 'nose', { length: current, name: 'Different' })).toBe(true);
  });

  it('is true for a key the node does not carry at all', () => {
    expect(patchChangesNode(unlinked(), 'nose', { comment: 'note' } as never)).toBe(true);
  });

  it('is false for a node that is not there, so nothing is attempted', () => {
    expect(patchChangesNode(s().tree, 'no-such-id', { length: 1 })).toBe(false);
  });

  it('is false for a repeated value on a catalog part, which keeps its link', () => {
    // A kernel setter given its current value returns before clearPreset() (Transition.setLength).
    const nose = findNode(s().tree, 'nose')!;
    expect(nose['preset']).toBeTruthy();
    expect(patchChangesNode(s().tree, 'nose', { length: nose.length as number })).toBe(false);
    s().setSelectedId('nose');
    s().patchSelected({ length: nose.length as number });
    expect(findNode(s().tree, 'nose')!['preset']).toEqual(nose['preset']);
  });
});

describe('patchSelected does nothing on a no-op', () => {
  beforeEach(() => {
    s().resetWorkspace();
    s().setSelectedId('nose');
  });

  it('leaves the tree IDENTICAL, which is what the rebuild keys on', () => {
    const before = unlinked();
    const current = findNode(before, 'nose')!.length as number;
    s().patchSelected({ length: current });
    // Reference equality: the rebuild effect compares `components` by identity.
    expect(s().tree).toBe(before);
    expect(s().tree.components).toBe(before.components);
  });

  it('opens no undo transaction, so there is no empty step to undo', () => {
    const tree = unlinked();
    const steps = s().past.length;
    s().patchSelected({ length: findNode(tree, 'nose')!.length as number });
    s().commitEdit();
    expect(s().past).toHaveLength(steps);
  });

  it('survives the clamped-keystroke sequence with one step', () => {
    const clamped = 0.42;
    const before = s().tree;
    s().patchSelected({ length: clamped });
    const afterFirst = s().tree;
    s().patchSelected({ length: clamped });
    s().patchSelected({ length: clamped });
    s().commitEdit();
    expect(afterFirst).not.toBe(before);
    expect(s().tree).toBe(afterFirst);
    expect(s().past).toHaveLength(1);
    expect(findNode(s().tree, 'nose')!.length).toBe(clamped);
  });

  it('still applies a real change after a no-op', () => {
    const current = findNode(unlinked(), 'nose')!.length as number;
    const steps = s().past.length;
    s().patchSelected({ length: current });
    s().patchSelected({ length: current + 0.05 });
    s().commitEdit();
    expect(findNode(s().tree, 'nose')!.length).toBeCloseTo(current + 0.05, 9);
    expect(s().past).toHaveLength(steps + 1);
  });

  it('still reconciles configurations when the mount flag really changes', () => {
    s().setSelectedId('body');
    const before = s().tree;
    s().patchSelected({ motorMount: true });
    expect(s().tree).not.toBe(before);
  });
});

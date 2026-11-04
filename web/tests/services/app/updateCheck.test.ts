import { describe, it, expect } from 'vitest';
import {
  UPDATE_MIN_GAP_MS,
  UPDATE_POLL_MS,
  UPDATE_SNOOZE_MS,
  dueForCheck,
  snoozeUntil,
  readyToApplyHidden,
  UPDATE_APPLY_HIDDEN_MS,
} from '../../../src/services/app/updateCheck';

const T = 1_700_000_000_000;

describe('dueForCheck', () => {
  it('is due when nothing has been checked yet', () => {
    expect(dueForCheck(null, T)).toBe(true);
  });

  it('holds off until the floor has passed, then allows one', () => {
    expect(dueForCheck(T, T + 1000)).toBe(false);
    expect(dueForCheck(T, T + UPDATE_MIN_GAP_MS - 1)).toBe(false);
    expect(dueForCheck(T, T + UPDATE_MIN_GAP_MS)).toBe(true);
  });

  it('takes a caller-supplied gap', () => {
    expect(dueForCheck(T, T + 1000, 500)).toBe(true);
    expect(dueForCheck(T, T + 1000, 5000)).toBe(false);
  });
});

describe('the intervals themselves', () => {
  it('poll less often than the floor, so the floor never blocks a poll', () => {
    expect(UPDATE_POLL_MS).toBeGreaterThan(UPDATE_MIN_GAP_MS);
  });

  it('snooze for hours, not seconds', () => {
    expect(UPDATE_SNOOZE_MS).toBeGreaterThanOrEqual(UPDATE_POLL_MS);
    expect(snoozeUntil(T)).toBe(T + UPDATE_SNOOZE_MS);
    expect(snoozeUntil(T, 1000)).toBe(T + 1000);
  });
});

describe('applying an update nobody answered', () => {
  const hidden = T - UPDATE_APPLY_HIDDEN_MS;

  it('waits for a worker to actually be there', () => {
    expect(readyToApplyHidden(false, hidden, false, T)).toBe(false);
  });

  it('does nothing while the tab is on screen', () => {
    expect(readyToApplyHidden(true, null, false, T)).toBe(false);
  });

  it('holds off until the tab has been hidden long enough, boundary included', () => {
    expect(readyToApplyHidden(true, T - 1, false, T)).toBe(false);
    expect(readyToApplyHidden(true, hidden + 1, false, T)).toBe(false);
    expect(readyToApplyHidden(true, hidden, false, T)).toBe(true);
    expect(readyToApplyHidden(true, hidden - 1, false, T)).toBe(true);
  });

  it('never throws away a flight that is still in the air', () => {
    expect(readyToApplyHidden(true, hidden, true, T)).toBe(false);
    expect(readyToApplyHidden(true, hidden, false, T)).toBe(true);
  });

  it('takes the threshold the caller names', () => {
    expect(readyToApplyHidden(true, T - 1000, false, T, 1000)).toBe(true);
    expect(readyToApplyHidden(true, T - 999, false, T, 1000)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { canRecordVideo, captionAt, pickVideoType, videoExt } from '../../../src/services/exports/flightVideo';

describe('pickVideoType', () => {
  it('prefers MP4 where the browser can write it', () => {
    expect(pickVideoType(() => true)).toBe('video/mp4;codecs=avc1');
  });

  it('falls back to WebM', () => {
    expect(pickVideoType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickVideoType((t) => t === 'video/webm')).toBe('video/webm');
  });

  it('is null when nothing records', () => {
    expect(pickVideoType(() => false)).toBeNull();
  });
});

describe('videoExt', () => {
  it('names the file after the container', () => {
    expect(videoExt('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExt('video/webm;codecs=vp8')).toBe('webm');
  });
});

describe('canRecordVideo', () => {
  it('is false without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    try {
      expect(canRecordVideo()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('is false when no container records', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    vi.stubGlobal(
      'HTMLCanvasElement',
      class {
        captureStream() {
          return null;
        }
      },
    );
    try {
      expect(canRecordVideo()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('captionAt', () => {
  const callouts = [
    { time: 0, text: 'Liftoff' },
    { time: 2, text: 'Burnout 40 m' },
    { time: 2, text: 'Burnout 40 m' },
    { time: 2, text: 'Separation' },
    { time: 9, text: 'Apogee 275 m' },
  ];

  it('shows the latest event reached within the hold', () => {
    expect(captionAt(callouts, 0.5, 2)?.text).toBe('Liftoff');
    expect(captionAt(callouts, 9.1, 2)?.text).toBe('Apogee 275 m');
  });

  it('shows nothing before the first event or after the hold', () => {
    expect(captionAt(callouts, 5, 2)).toBeNull();
    expect(captionAt([{ time: 1, text: 'Liftoff' }], 0.5, 2)).toBeNull();
  });

  it('joins events at one instant once each', () => {
    expect(captionAt(callouts, 2.1, 2)?.text).toBe('Burnout 40 m · Separation');
  });

  it('a newer event replaces an older one still held', () => {
    expect(captionAt(callouts, 2.1, 10)?.text).toBe('Burnout 40 m · Separation');
  });

  it('fades out over the last quarter of its hold', () => {
    expect(captionAt(callouts, 9, 2)?.alpha).toBe(1);
    expect(captionAt(callouts, 10.5, 2)?.alpha).toBe(1);
    expect(captionAt(callouts, 10.75, 2)?.alpha).toBeCloseTo(0.5);
  });

  it('shows nothing with no hold', () => {
    expect(captionAt(callouts, 0, 0)).toBeNull();
  });
});

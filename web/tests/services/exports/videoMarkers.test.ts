import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { crossed } from '../../../src/services/exports/flightVideo';
import {
  flightVideoZip,
  groupMarkers,
  markerFiles,
  toResolveEdl,
  toSrt,
  toYoutubeChapters,
} from '../../../src/services/exports/videoMarkers';

const marks = [
  { seconds: 0, text: 'Liftoff' },
  { seconds: 1.5, text: 'Burnout 42 m' },
  { seconds: 1.51, text: 'Burnout 42 m' },
  { seconds: 1.51, text: 'Separation' },
  { seconds: 6.3, text: 'Apogee 275 m' },
  { seconds: 18, text: 'Main <deployed> & "open"' },
  { seconds: 40, text: 'Landing' },
];

describe('groupMarkers', () => {
  it('folds events within a frame into one marker, each name once', () => {
    const g = groupMarkers(marks, 30);
    expect(g.map((m) => m.text)).toEqual([
      'Liftoff',
      'Burnout 42 m · Separation',
      'Apogee 275 m',
      'Main <deployed> & "open"',
      'Landing',
    ]);
  });
});

describe('toSrt', () => {
  it('numbers each cue and holds it until the next or 2.5 s', () => {
    const srt = toSrt(groupMarkers(marks, 30), 41);
    expect(srt).toContain('1\r\n00:00:00,000 --> 00:00:01,500\r\nLiftoff\r\n');
    expect(srt).toContain('3\r\n00:00:06,300 --> 00:00:08,800\r\nApogee 275 m\r\n');
    expect(srt).toContain('00:00:40,000 --> 00:00:41,000\r\nLanding');
  });
});

describe('toResolveEdl', () => {
  it('puts each marker at its timecode from 01:00:00:00', () => {
    const edl = toResolveEdl([{ seconds: 6.3, text: 'Apogee | top' }], 30, 'My rocket');
    expect(edl).toContain('TITLE: My rocket');
    expect(edl).toContain('001  001      V     C        01:00:06:09 01:00:06:10 01:00:06:09 01:00:06:10');
    expect(edl).toContain(' |C:ResolveColorBlue |M:Apogee top |D:1');
  });
});

describe('toYoutubeChapters', () => {
  it('starts at 0:00 and folds chapters under 10 s into the one before', () => {
    expect(toYoutubeChapters(groupMarkers(marks, 30), 75)).toBe(
      '0:00 Liftoff · Burnout 42 m · Separation · Apogee 275 m\n0:18 Main <deployed> & "open"\n0:40 Landing\n',
    );
  });

  it('folds a last chapter under 10 s from the end', () => {
    expect(
      toYoutubeChapters(
        [
          { seconds: 0, text: 'A' },
          { seconds: 15, text: 'B' },
        ],
        20,
      ),
    ).toBe('0:00 A · B\n');
  });
});

describe('markerFiles', () => {
  const files = markerFiles({
    markers: marks,
    duration: 30,
    fps: 30,
    width: 1920,
    height: 1080,
    videoName: 'My rocket-flight.mp4',
    title: 'My <rocket>',
  });

  it('drops events past the end of the video', () => {
    expect(files.srt).not.toContain('Landing');
  });

  it('escapes the FCPXML and links the video beside it', () => {
    expect(files.fcpxml).toContain('value="Main &lt;deployed&gt; &amp; &quot;open&quot;"');
    expect(files.fcpxml).toContain('src="My%20rocket-flight.mp4"');
    expect(files.fcpxml).toContain('<marker start="189/30s" duration="1/30s" value="Apogee 275 m"/>');
    expect(files.fcpxml).toContain('name="My &lt;rocket&gt;"');
  });
});

describe('flightVideoZip', () => {
  it('holds the video and each marker file under one name', async () => {
    const zip = await flightVideoZip(
      {
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }),
        ext: 'mp4',
        duration: 10,
        markers: [{ seconds: 0, text: 'Liftoff' }],
        fps: 30,
        width: 640,
        height: 360,
      },
      'rocket-flight',
      'Rocket',
    );
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'rocket-flight.chapters.txt',
      'rocket-flight.edl',
      'rocket-flight.fcpxml',
      'rocket-flight.mp4',
      'rocket-flight.srt',
    ]);
    expect([...files['rocket-flight.mp4']!]).toEqual([1, 2, 3]);
    expect(strFromU8(files['rocket-flight.chapters.txt']!)).toBe('0:00 Liftoff\n');
  });
});

describe('crossed', () => {
  const callouts = [
    { time: 0, text: 'Liftoff' },
    { time: 2, text: 'Burnout' },
    { time: 9, text: 'Apogee' },
  ];

  it('logs what the first frame has already reached', () => {
    expect(crossed(callouts, null, 0).map((c) => c.text)).toEqual(['Liftoff']);
  });

  it('logs each event once as play passes it', () => {
    expect(crossed(callouts, 1.9, 2).map((c) => c.text)).toEqual(['Burnout']);
    expect(crossed(callouts, 2, 2.1)).toEqual([]);
  });

  it('skips events jumped over or scrubbed back across', () => {
    expect(crossed(callouts, 2.1, 9.5)).toEqual([]);
    expect(crossed(callouts, 9.5, 1)).toEqual([]);
  });
});

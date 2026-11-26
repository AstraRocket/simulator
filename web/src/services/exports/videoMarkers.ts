// Marker files that let a video editor cue off the recorded flight's events.

import type { FlightVideo } from './flightVideo';

/** An event as it fell in the video. */
export interface VideoMarker {
  /** Seconds into the video. */
  seconds: number;
  text: string;
}

export interface MarkerFileInput {
  markers: readonly VideoMarker[];
  /** The video's length in seconds. */
  duration: number;
  fps: number;
  width: number;
  height: number;
  /** The video's file name, as it sits beside these in the zip. */
  videoName: string;
  title: string;
}

// As long as the burned-in caption stays up.
const SRT_HOLD_S = 2.5;
// YouTube refuses every chapter when one is shorter than this, or there are fewer than three.
const YT_MIN_CHAPTER_S = 10;
// Resolve's default timeline start.
const EDL_START_HOURS = 1;

/** Events in one frame read as one marker: a cluster's burnouts, or burnout and separation together. */
export function groupMarkers(markers: readonly VideoMarker[], fps: number): VideoMarker[] {
  const sorted = [...markers].sort((a, b) => a.seconds - b.seconds);
  const out: { seconds: number; texts: string[] }[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.seconds - last.seconds < 1 / fps) {
      if (!last.texts.includes(m.text)) last.texts.push(m.text);
    } else out.push({ seconds: m.seconds, texts: [m.text] });
  }
  return out.map((g) => ({ seconds: g.seconds, text: g.texts.join(' · ') }));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function srtTime(s: number): string {
  const ms = Math.max(0, Math.round(s * 1000));
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(markers: readonly VideoMarker[], duration: number): string {
  return markers
    .map((m, i) => {
      const next = markers[i + 1]?.seconds ?? Infinity;
      const end = Math.max(m.seconds + 0.1, Math.min(m.seconds + SRT_HOLD_S, next, duration));
      return `${i + 1}\r\n${srtTime(m.seconds)} --> ${srtTime(end)}\r\n${m.text}\r\n`;
    })
    .join('\r\n');
}

function timecode(s: number, fps: number): string {
  const frames = Math.max(0, Math.round(s * fps));
  const f = frames % fps;
  const total = Math.floor(frames / fps);
  return `${pad(EDL_START_HOURS + Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(f)}`;
}

// EDL is a line format: a name may not carry a break or the field separator.
const edlText = (s: string) => s.replace(/\s*[\r\n|]+\s*/g, ' ').trim();

/** DaVinci Resolve's marker EDL: Timeline ▸ Import ▸ Timeline Markers from EDL. */
export function toResolveEdl(markers: readonly VideoMarker[], fps: number, title: string): string {
  const lines = [`TITLE: ${edlText(title)}`, 'FCM: NON-DROP FRAME', ''];
  markers.forEach((m, i) => {
    const a = timecode(m.seconds, fps);
    const b = timecode(m.seconds + 1 / fps, fps);
    lines.push(`${pad(i + 1, 3)}  001      V     C        ${a} ${b} ${a} ${b}  `);
    lines.push(` |C:ResolveColorBlue |M:${edlText(m.text)} |D:1`, '');
  });
  return lines.join('\r\n');
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** FCPXML times are rational: whole frames over the frame rate. */
const rational = (s: number, fps: number) => `${Math.max(0, Math.round(s * fps))}/${fps}s`;

/** Final Cut Pro (and Resolve) project: the video on a timeline with a marker at each event. */
export function toFcpxml(input: MarkerFileInput, markers: readonly VideoMarker[]): string {
  const { fps, width, height, videoName, title, duration } = input;
  const dur = rational(duration, fps);
  const name = xml(title);
  const marks = markers
    .map((m) => `            <marker start="${rational(m.seconds, fps)}" duration="1/${fps}s" value="${xml(m.text)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/${fps}s" width="${width}" height="${height}"/>
    <asset id="r2" name="${name}" start="0s" duration="${dur}" hasVideo="1" format="r1">
      <media-rep kind="original-media" src="${xml(encodeURI(videoName))}"/>
    </asset>
  </resources>
  <library>
    <event name="${name}">
      <project name="${name}">
        <sequence format="r1" duration="${dur}" tcStart="0s">
          <spine>
            <asset-clip ref="r2" name="${name}" offset="0s" start="0s" duration="${dur}">
${marks}
            </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}

function chapterTime(s: number): string {
  const t = Math.floor(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(t % 60)}` : `${m}:${pad(t % 60)}`;
}

/** A list to paste into a YouTube description. The first starts at 0:00; one too soon after the last is folded in. */
export function toYoutubeChapters(markers: readonly VideoMarker[], duration: number): string {
  const kept: VideoMarker[] = [];
  for (const m of markers) {
    const last = kept[kept.length - 1];
    if (!last) kept.push({ seconds: 0, text: m.text });
    else if (m.seconds - last.seconds >= YT_MIN_CHAPTER_S && duration - m.seconds >= YT_MIN_CHAPTER_S) kept.push(m);
    else last.text = `${last.text} · ${m.text}`;
  }
  return kept.map((m) => `${chapterTime(m.seconds)} ${m.text}`).join('\n') + '\n';
}

/** Each marker file by its extension, to sit beside the video. */
export function markerFiles(input: MarkerFileInput): Record<'srt' | 'edl' | 'fcpxml' | 'chapters.txt', string> {
  const markers = groupMarkers(input.markers, input.fps).filter((m) => m.seconds <= input.duration);
  return {
    srt: toSrt(markers, input.duration),
    edl: toResolveEdl(markers, input.fps, input.title),
    fcpxml: toFcpxml(input, markers),
    'chapters.txt': toYoutubeChapters(markers, input.duration),
  };
}

/** The video and its marker files, each named `base` plus its extension, in one zip. */
export async function flightVideoZip(video: FlightVideo, base: string, title: string): Promise<Blob> {
  const { zipSync, strToU8 } = await import('fflate');
  const videoName = `${base}.${video.ext}`;
  const files = markerFiles({ ...video, videoName, title });
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    // Already compressed: stored, not deflated again.
    [videoName]: [new Uint8Array(await video.blob.arrayBuffer()), { level: 0 }],
  };
  for (const [ext, text] of Object.entries(files)) entries[`${base}.${ext}`] = strToU8(text);
  return new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' });
}

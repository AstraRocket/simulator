import type { VideoMarker } from './videoMarkers';

// MP4 first: it plays everywhere; WebM is what Firefox and older Chrome can write.
const VIDEO_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/** The first container the browser can record, or null when it records none. */
export function pickVideoType(isSupported: (type: string) => boolean): string | null {
  return VIDEO_TYPES.find((type) => isSupported(type)) ?? null;
}

export function videoExt(mime: string): 'mp4' | 'webm' {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export function canRecordVideo(): boolean {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false;
  return pickVideoType((type) => MediaRecorder.isTypeSupported(type)) !== null;
}

export interface HudLine {
  label: string;
  value: string;
}

export interface LegendRow {
  color: string;
  label: string;
}

export interface DialFace {
  /** The rose's turn, as the camera has it. */
  roseDeg: number;
  /** The way the wind blows to, null when calm or unknown. */
  windToDeg: number | null;
  speed: string;
  north: string;
}

/** A flight event as the video calls it out. */
export interface Callout {
  /** Flight seconds. */
  time: number;
  text: string;
}

export interface Caption {
  text: string;
  /** 0 to 1, fading out at the end of its hold. */
  alpha: number;
}

export interface VideoTimeline {
  /** 0 to 1. */
  progress: number;
  /** Each event's place along the bar, 0 to 1. */
  ticks: readonly number[];
}

/** What is drawn over each frame: the readouts top left, the legend and the compass top right, the caption and timeline below. */
export interface FlightOverlay {
  hud: readonly HudLine[];
  legend: readonly LegendRow[];
  dial: DialFace | null;
  caption: Caption | null;
  timeline: VideoTimeline | null;
  /** Flight seconds now, and the events to log as the replay crosses them. */
  clock: { at: number; callouts: readonly Callout[] } | null;
}

// More flight time than this between frames is a jump (Jump to event), not play: its events are not logged.
const MAX_STEP_S = 2;

/** The events played through between two frames; on the first frame (`from` null), those already reached. */
export function crossed(callouts: readonly Callout[], from: number | null, to: number): Callout[] {
  if (from === null) return callouts.filter((c) => c.time <= to);
  if (to - from > MAX_STEP_S || to <= from) return [];
  return callouts.filter((c) => c.time > from && c.time <= to);
}

const FADE = 0.25;

/**
 * The latest event reached within `hold` flight seconds, faded over the last quarter of its hold.
 * Events at one instant (a cluster's burnouts) share a caption.
 */
export function captionAt(callouts: readonly Callout[], at: number, hold: number): Caption | null {
  if (!(hold > 0)) return null;
  let last: Callout | null = null;
  for (const c of callouts) if (c.time <= at && (!last || c.time >= last.time)) last = c;
  if (!last || at - last.time > hold) return null;
  const text = [...new Set(callouts.filter((c) => c.time === last.time).map((c) => c.text))].join(' · ');
  const left = (hold - (at - last.time)) / hold;
  return { text, alpha: Math.min(1, left / FADE) };
}

const FPS = 30;
// Video encoders want even dimensions.
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

const PANEL = 'rgba(0, 0, 0, 0.55)';
const INK = '#fff';
const INK_SOFT = 'rgba(255, 255, 255, 0.7)';
const INK_FAINT = 'rgba(255, 255, 255, 0.35)';
const NORTH = '#f87171';
const WIND = '#38bdf8';
const font = (px: number, weight = 400) => `${weight} ${px}px system-ui, sans-serif`;

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawHud(ctx: CanvasRenderingContext2D, lines: readonly HudLine[], s: number): void {
  if (!lines.length) return;
  const pad = 10 * s;
  const gap = 14 * s;
  const labelPx = 9 * s;
  const valuePx = 13 * s;
  const widths = lines.map((l) => {
    ctx.font = font(valuePx, 600);
    const v = ctx.measureText(l.value).width;
    ctx.font = font(labelPx);
    return Math.max(v, ctx.measureText(l.label.toUpperCase()).width);
  });
  const w = widths.reduce((a, b) => a + b, 0) + gap * (lines.length - 1) + pad * 2;
  const h = labelPx + valuePx + pad * 2 + 3 * s;
  const x0 = 12 * s;
  const y0 = 12 * s;
  panel(ctx, x0, y0, w, h, 8 * s);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  let x = x0 + pad;
  lines.forEach((l, i) => {
    ctx.font = font(labelPx);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(l.label.toUpperCase(), x, y0 + pad);
    ctx.font = font(valuePx, 600);
    ctx.fillStyle = INK;
    ctx.fillText(l.value, x, y0 + pad + labelPx + 3 * s);
    x += widths[i]! + gap;
  });
}

/** Returns the bottom edge of the legend's panel, so the dial goes below it. */
function drawLegend(ctx: CanvasRenderingContext2D, rows: readonly LegendRow[], right: number, s: number): number {
  const top = 12 * s;
  if (!rows.length) return top - 8 * s;
  const pad = 8 * s;
  const sw = 10 * s;
  const rowH = 16 * s;
  const textPx = 10 * s;
  ctx.font = font(textPx);
  const textW = Math.max(...rows.map((r) => ctx.measureText(r.label).width));
  const w = pad * 2 + sw + 6 * s + textW;
  const h = pad * 2 + rowH * rows.length - 4 * s;
  const x0 = right - w;
  panel(ctx, x0, top, w, h, 8 * s);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  rows.forEach((r, i) => {
    const cy = top + pad + rowH * i + (rowH - 4 * s) / 2;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.roundRect(x0 + pad, cy - sw / 2, sw, sw, 2 * s);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(r.label, x0 + pad + sw + 6 * s, cy);
  });
  return top + h;
}

// As FlightDial's SVG: a 64-unit view box drawn 56 px wide.
function drawDial(ctx: CanvasRenderingContext2D, dial: DialFace, right: number, top: number, s: number): void {
  const size = 56 * s;
  const pad = 6 * s;
  const textPx = 10 * s;
  ctx.font = font(textPx);
  const w = Math.max(size, ctx.measureText(dial.speed).width) + pad * 2;
  const h = size + textPx + pad * 2 + 2 * s;
  const x0 = right - w;
  panel(ctx, x0, top, w, h, 8 * s);
  const u = size / 64;
  const cx = x0 + w / 2;
  const cy = top + pad + size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(u, u);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK_FAINT;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate((dial.roseDeg * Math.PI) / 180);
  ctx.lineCap = 'butt';
  for (const a of [0, 90, 180, 270]) {
    ctx.save();
    ctx.rotate((a * Math.PI) / 180);
    ctx.strokeStyle = a === 0 ? NORTH : INK_SOFT;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.font = font(9, 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(dial.north, 0, -24);
  if (dial.windToDeg != null) {
    ctx.rotate((dial.windToDeg * Math.PI) / 180);
    ctx.strokeStyle = WIND;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(0, -13);
    ctx.moveTo(-4.5, -7);
    ctx.lineTo(0, -14);
    ctx.lineTo(4.5, -7);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = INK_SOFT;
  ctx.font = font(textPx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(dial.speed, cx, top + pad + size + 2 * s);
}

const BAR = '#38bdf8';
const TICK = '#fcd34d';

/** Returns the top of the timeline, so the caption sits above it. */
function drawTimeline(
  ctx: CanvasRenderingContext2D,
  line: VideoTimeline,
  width: number,
  height: number,
  s: number,
): number {
  const margin = 16 * s;
  const barH = 4 * s;
  const y = height - margin - barH;
  const w = width - margin * 2;
  const r = barH / 2;
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(margin, y, w, barH, r);
  ctx.fill();
  ctx.fillStyle = BAR;
  ctx.beginPath();
  ctx.roundRect(margin, y, Math.max(barH, w * Math.min(1, Math.max(0, line.progress))), barH, r);
  ctx.fill();
  for (const tick of line.ticks) {
    ctx.fillStyle = tick <= line.progress ? TICK : INK_SOFT;
    ctx.fillRect(margin + w * tick - s, y - 3 * s, 2 * s, barH + 6 * s);
  }
  return y - 3 * s;
}

function drawCaption(ctx: CanvasRenderingContext2D, caption: Caption, width: number, bottom: number, s: number): void {
  const px = 22 * s;
  const padX = 16 * s;
  const padY = 9 * s;
  ctx.font = font(px, 700);
  const w = ctx.measureText(caption.text).width + padX * 2;
  const h = px + padY * 2;
  const x = (width - w) / 2;
  const y = bottom - 16 * s - h;
  ctx.save();
  ctx.globalAlpha = caption.alpha;
  panel(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption.text, width / 2, y + h / 2);
  ctx.restore();
}

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: FlightOverlay,
  width: number,
  height: number,
  s: number,
): void {
  drawHud(ctx, overlay.hud, s);
  const top = overlay.timeline ? drawTimeline(ctx, overlay.timeline, width, height, s) : height;
  if (overlay.caption) drawCaption(ctx, overlay.caption, width, top, s);
  const right = width - 12 * s;
  const below = drawLegend(ctx, overlay.legend, right, s);
  if (overlay.dial) drawDial(ctx, overlay.dial, right, below + 8 * s, s);
}

export interface FlightVideo {
  blob: Blob;
  ext: 'mp4' | 'webm';
  /** Seconds. */
  duration: number;
  /** Each event as it fell in the video. */
  markers: VideoMarker[];
  fps: number;
  width: number;
  height: number;
}

export interface FlightVideoRecording {
  /** Resolves with the video once the recorder has flushed. */
  stop: () => Promise<FlightVideo>;
}

/** Copies the 3D canvas each frame onto a 2D one with the overlay drawn in, and records that. */
export function recordFlightVideo(source: HTMLCanvasElement, overlay: () => FlightOverlay): FlightVideoRecording {
  const mime = pickVideoType((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error('This browser cannot record video.');
  const out = document.createElement('canvas');
  out.width = even(source.width);
  out.height = even(source.height);
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas to record into.');
  // The drawing buffer is device pixels; the overlay is laid out in CSS pixels.
  const scale = source.clientWidth > 0 ? source.width / source.clientWidth : 1;

  let frame = 0;
  let startedAt = performance.now();
  let lastAt: number | null = null;
  const markers: VideoMarker[] = [];
  const paint = () => {
    const now = overlay();
    ctx.drawImage(source, 0, 0, out.width, out.height);
    drawOverlay(ctx, now, out.width, out.height, scale);
    if (now.clock) {
      const seconds = (performance.now() - startedAt) / 1000;
      for (const c of crossed(now.clock.callouts, lastAt, now.clock.at)) markers.push({ seconds, text: c.text });
      lastAt = now.clock.at;
    }
    frame = requestAnimationFrame(paint);
  };

  const recorder = new MediaRecorder(out.captureStream(FPS), {
    mimeType: mime,
    videoBitsPerSecond: Math.round(out.width * out.height * FPS * 0.15),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(1000);
  startedAt = performance.now();
  paint();

  const stop = () =>
    new Promise<FlightVideo>((resolve, reject) => {
      cancelAnimationFrame(frame);
      const duration = (performance.now() - startedAt) / 1000;
      const done = () =>
        resolve({
          blob: new Blob(chunks, { type: mime }),
          ext: videoExt(mime),
          duration,
          markers,
          fps: FPS,
          width: out.width,
          height: out.height,
        });
      if (recorder.state === 'inactive') {
        done();
        return;
      }
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        done();
      };
      recorder.onerror = () => reject(new Error('The video recorder failed.'));
      recorder.stop();
    });

  return { stop };
}

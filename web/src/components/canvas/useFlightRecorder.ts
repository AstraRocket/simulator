import { useEffect, useRef, useState, type RefObject, type SetStateAction } from 'react';
import { recordFlightVideo, type FlightVideoRecording, type FlightOverlay } from '../../services/exports/flightVideo';
import { flightVideoZip } from '../../services/exports/videoMarkers';
import { saveBlob } from '../../services/files/saveFile';
import type { FlightPlayback } from './useFlightPlayback';

/**
 * Records the flight from launch to landing; pausing, dragging the slider or reset ends the take and saves it,
 * zipped with marker files for video editors.
 */
export function useFlightRecorder(
  containerRef: RefObject<HTMLElement | null>,
  playback: FlightPlayback,
  overlay: () => FlightOverlay,
  /** `base`: the file name without extension; `title`: the project and timeline name in the marker files. */
  naming: () => { base: string; title: string },
) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const take = useRef<FlightVideoRecording | null>(null);
  // The paint loop reads the newest overlay, not the one from the render that started the take.
  const overlayRef = useRef(overlay);
  const nameRef = useRef(naming);
  useEffect(() => {
    overlayRef.current = overlay;
    nameRef.current = naming;
  });

  const finish = async () => {
    const current = take.current;
    take.current = null;
    setRecording(false);
    if (!current) return;
    try {
      const video = await current.stop();
      if (video.blob.size === 0) return;
      const { base, title } = nameRef.current();
      await saveBlob(await flightVideoZip(video, base, title), `${base}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (!canvas) return;
    setError(null);
    // Before the first frame: it logs the events already reached, so it must be at liftoff.
    playback.seek(0);
    try {
      take.current = recordFlightVideo(canvas, () => overlayRef.current());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    // A looping replay never ends, so the take would never save.
    playback.setLoop(false);
    playback.setPlaying(true);
    setRecording(true);
  };

  const stop = () => {
    playback.setPlaying(false);
    void finish();
  };

  const toggle = () => (recording ? stop() : start());

  /** The controls the view hands out, each ending the take where it stops the replay. */
  const wrap = (p: FlightPlayback): FlightPlayback =>
    recording
      ? {
          ...p,
          onEnd: () => {
            p.onEnd();
            void finish();
          },
          setPlaying: (v: SetStateAction<boolean>) => {
            if (v === false) stop();
            else p.setPlaying(v);
          },
          handlePlay: stop,
          handleReset: () => {
            p.handleReset();
            void finish();
          },
        }
      : p;

  // Leaving the view drops the take unsaved.
  useEffect(
    () => () => {
      take.current?.stop().catch(() => undefined);
      take.current = null;
    },
    [],
  );

  return { recording, error, toggle, wrap };
}

export type FlightRecorder = ReturnType<typeof useFlightRecorder>;

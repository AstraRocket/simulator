import { useCallback, useEffect, useRef, useState } from 'react';

/** Play, seek, loop and the launch countdown; the frame loop advances `progressRef` itself. */
export function useFlightPlayback(initialSpeed: number) {
  // The HUD copy; the frame loop owns the live value (progressRef).
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed);
  const [follow, setFollow] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    if (countdown === null) return;
    const id = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
        return;
      }
      setCountdown(null);
      progressRef.current = 0;
      setProgress(0);
      setPlaying(true);
    }, 900);
    return () => clearTimeout(id);
  }, [countdown]);

  const seek = useCallback((v: number) => {
    progressRef.current = v;
    setProgress(v);
  }, []);
  const onTick = useCallback((p: number) => setProgress(p), []);
  const onEnd = useCallback(() => setPlaying(false), []);

  const handlePlay = () => {
    if (countdown !== null) {
      setCountdown(null);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    // The live value: the HUD copy can lag by a tick.
    const p = progressRef.current;
    if (p <= 0.001 || p >= 0.999) setCountdown(5);
    else setPlaying(true);
  };
  const handleReset = () => {
    setPlaying(false);
    setCountdown(null);
    seek(0);
  };

  return {
    progress,
    playing,
    setPlaying,
    speed,
    setSpeed,
    follow,
    setFollow,
    countdown,
    loop,
    setLoop,
    progressRef,
    seek,
    onTick,
    onEnd,
    handlePlay,
    handleReset,
  };
}

export type FlightPlayback = ReturnType<typeof useFlightPlayback>;

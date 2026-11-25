import { useMemo } from 'react';
import * as THREE from 'three';
import type { FlightBody } from '../../services/flight/flightBodies';
import type { CameraChoice, FlightView } from './flightCamera';
import type { Shot } from './flightCameraRig';
import { directedView, directorCuts } from './flightDirector';
import type { FlightScene } from './flightScene';

/** What the camera is asked to show at a moment of the flight. */
export function useFlightShot(
  scene: FlightScene,
  bodies: readonly FlightBody[],
  { view, tracked, viewEpoch }: { view: CameraChoice; tracked: number; viewEpoch: number },
  {
    bounds,
    overviewScale,
    totalLen,
    maxR,
  }: { bounds: THREE.Box3; overviewScale: number; totalLen: number; maxR: number },
): (t: number) => Shot {
  return useMemo(() => {
    const { unitsPerMeter, tracks } = scene;
    const showing = (shown: FlightView): Shot => ({
      view: shown,
      directed: view === 'director',
      tracked,
      epoch: viewEpoch,
      bounds,
      track: scene,
      unitsPerMeter,
      overviewScale,
      rocketLengthM: totalLen,
      bodyRadiusM: maxR,
    });
    if (view !== 'director') {
      const shot = showing(view);
      return () => shot;
    }
    const pad = scene.scenePts[0] ?? new THREE.Vector3();
    const events = bodies[tracked]?.branch.events ?? [];
    const cuts = directorCuts(events, bodies[0]?.branch.events ?? [], tracks[tracked] ?? scene, pad, unitsPerMeter);
    const shots = new Map(cuts.map((c) => [c.view, showing(c.view)]));
    const opening = showing('pad');
    return (t: number) => shots.get(directedView(cuts, t)) ?? opening;
  }, [scene, bodies, view, tracked, viewEpoch, bounds, overviewScale, totalLen, maxR]);
}

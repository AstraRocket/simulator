import { useMemo } from 'react';
import * as THREE from 'three';
import type { RocketTree } from '../../engine/openRocketEngine';
import { airframes, type Airframe } from '../../services/flight/airframe';
import type { FlightBody } from '../../services/flight/flightBodies';
import { deployments, flightPops, mountBurns } from '../../services/flight/flightSources';
import type { MotorDims } from '../../tree/schematicGeometry';
import { usePartPalette } from '../common/usePartPalette';
import { bodyPieces, bodySpans, pieceExtent } from './bodyMotion';
import { AirframeRig, assemblyCopies, onAxis } from './airframeRig';
import { drawnMotion } from './drawnMotion';
import type { FlightScene } from './flightScene';
import { airframeRadius } from './launchPad';
import { hungDevices } from './hungDevices';
import { recoveryShape } from './recoveryMotion';
import { usePieces } from './usePieces';

const OVERVIEW_LEN = 1.6; // the rocket's drawn length in the overview, scene units

const cordsOf = (frames: readonly Airframe[], body: number): number =>
  frames.reduce((most, f) => (f.body === body ? Math.max(most, cordLength(f)) : most), 0);

const cordLength = (f: Airframe): number => f.joints.reduce((sum, j) => sum + j.cord, 0);

/** What a flight's view is drawn from, worked out once per flight. */
export function useFlightParts(
  scene: FlightScene,
  bodies: readonly FlightBody[],
  tree: RocketTree,
  motors: MotorDims | undefined,
  effects: boolean,
) {
  const palette = usePartPalette();
  const { pieces, nozzles, totalLen, maxR } = usePieces(tree, motors, palette);
  const { unitsPerMeter, tracks } = scene;
  const overviewScale = Math.max(OVERVIEW_LEN / Math.max(totalLen, 0.05), unitsPerMeter);
  const devices = useMemo(() => deployments(tree, bodies), [tree, bodies]);
  const shapes = useMemo(() => devices.map((d) => recoveryShape(d.device, palette)), [devices, palette]);
  const burns = useMemo(() => mountBurns(tree, bodies), [tree, bodies]);
  const owned = useMemo(() => bodyPieces(bodies, pieces), [bodies, pieces]);
  const extents = useMemo(() => owned.map(pieceExtent), [owned]);
  const spans = useMemo(() => bodySpans(bodies, tracks, extents), [bodies, tracks, extents]);
  const pops = useMemo(() => flightPops(tree, bodies), [tree, bodies]);
  const radius = useMemo(() => airframeRadius(pieces), [pieces]);
  const frames = useMemo(() => (effects ? airframes(tree, bodies, devices) : []), [effects, tree, bodies, devices]);
  const drawn = useMemo(
    () => (effects ? bodies.map((b, i) => drawnMotion(b, tracks[i]!, spans[i]?.at(-1), cordsOf(frames, i))) : []),
    [effects, bodies, tracks, spans, frames],
  );
  const rigs = useMemo(
    () =>
      frames.map((frame) => {
        const { assemblyId, body } = frame;
        const under = shapes.filter((x, i) => devices[i]!.body === body && x.kind === 'parachute');
        const canopy = Math.max(0, ...under.map((x) => (x.kind === 'parachute' ? x.mouth : 0)));
        const places = assemblyId == null ? onAxis() : assemblyCopies(pieces, assemblyId);
        return new AirframeRig(frame, places, drawn[body]!, radius, canopy);
      }),
    [frames, shapes, devices, pieces, drawn, radius],
  );
  const hung = useMemo(() => hungDevices(devices, shapes, rigs), [devices, shapes, rigs]);

  const bounds = useMemo(() => {
    const box = new THREE.Box3();
    for (const track of tracks) for (const p of track.scenePts) box.expandByPoint(p);
    // Down to the ground, the pad's or a lower landing's, never past it.
    const lowest = Math.min(0, box.min.y);
    box.expandByScalar((totalLen * overviewScale) / 2);
    box.min.y = lowest;
    return box;
  }, [tracks, totalLen, overviewScale]);
  return {
    pieces,
    nozzles,
    totalLen,
    maxR,
    overviewScale,
    devices,
    shapes,
    burns,
    owned,
    extents,
    spans,
    pops,
    radius,
    frames,
    rigs,
    hung,
    drawn,
    bounds,
  };
}

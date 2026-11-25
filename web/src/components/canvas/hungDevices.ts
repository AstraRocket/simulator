import type * as THREE from 'three';
import type { Deployment } from '../../services/flight/flightSources';
import type { AirframeRig } from './airframeRig';
import type { RecoveryShape } from './recoveryMotion';

/** A recovery device as drawn: one for each copy of the strap-on or pod it is in. */
export interface HungDevice extends Deployment {
  shape: RecoveryShape;
  /** Where it is tied, in the rocket's frame; null for the front of its body. */
  tie: ((out: THREE.Vector3) => THREE.Vector3) | null;
  /** How far it leans clear of what is above it, 0 to 1. */
  aside: () => number;
  /** Those it shares a body, and a copy of it, with. */
  group: string;
}

const UPRIGHT = () => 0;

function tied(d: Deployment, shape: RecoveryShape, rig: AirframeRig, copy: number, carrier: Carrier): HungDevice {
  const { frame, pose } = rig;
  const { id } = d.device;
  const joint = frame.joints.findIndex((j) => id != null && j.deviceIds.includes(id));
  const nth = joint < 0 || id == null ? 0 : frame.joints[joint]!.deviceIds.indexOf(id);
  const section = Math.max(
    0,
    frame.sections.findIndex((s) => id != null && s.partIds.has(id)),
  );
  return {
    ...d,
    shape,
    group: `${d.body}/${rig.copies[copy]!.path}`,
    tie: (out) => carrier(joint < 0 ? rig.upperEnd(copy, section, out) : rig.tie(copy, joint, nth, out)),
    aside: joint < 0 ? UPRIGHT : () => pose.joints[joint]!.aside,
  };
}

type Carrier = (v: THREE.Vector3) => THREE.Vector3;

/** Moves a point on a pod with the section the pod is on. */
function carriedBy(rig: AirframeRig, copy: number, rigs: readonly AirframeRig[]): Carrier {
  const { carrierId, body } = rig.frame;
  if (carrierId == null) return (v) => v;
  const path = rig.copies[copy]!.path;
  for (const r of rigs) {
    if (r === rig || r.frame.body !== body) continue;
    const k = r.frame.sections.findIndex((s) => s.partIds.has(carrierId));
    const on = r.copies.find((x) => path.startsWith(x.path));
    if (k < 0 || !on) continue;
    const further = carriedBy(r, r.copies.indexOf(on), rigs);
    return (v) => further(v.applyMatrix4(on.sections[k]!));
  }
  return (v) => v;
}

/** In step with nothing: a device in two copies is two. */
export function hungDevices(
  devices: readonly Deployment[],
  shapes: readonly RecoveryShape[],
  rigs: readonly AirframeRig[],
): HungDevice[] {
  return devices.flatMap((d, i): HungDevice[] => {
    const shape = shapes[i]!;
    const { id } = d.device;
    // The innermost: a pod's part is in the section it is on too.
    const holding = rigs.filter(
      (r) => r.frame.body === d.body && id != null && r.frame.sections.some((s) => s.partIds.has(id)),
    );
    const rig = holding.find((r) => r.frame.joints.some((j) => id != null && j.deviceIds.includes(id))) ?? holding[0];
    if (!rig) return [{ ...d, shape, tie: null, aside: UPRIGHT, group: String(d.body) }];
    return rig.copies.map((_, copy) => tied(d, shape, rig, copy, carriedBy(rig, copy, rigs)));
  });
}

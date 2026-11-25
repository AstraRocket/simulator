import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { AirframeRig, assemblyCopies, onAxis, type CopyPlace } from '../../../src/components/canvas/airframeRig';
import type { DrawnMotion } from '../../../src/components/canvas/drawnMotion';
import { hungDevices } from '../../../src/components/canvas/hungDevices';
import type { RecoveryShape } from '../../../src/components/canvas/recoveryMotion';
import type { Piece } from '../../../src/components/canvas/rocketPieces';
import {
  airframePose,
  foreEnd,
  newAirframePose,
  openingOrder,
  poseReach,
} from '../../../src/components/canvas/sectionPoses';
import type { Airframe } from '../../../src/services/flight/airframe';
import type { Deployment } from '../../../src/services/flight/flightSources';

const section = (fore: number, aft: number, ...ids: string[]) => ({ fore, aft, radius: 0.02, partIds: new Set(ids) });
// Nose, main bay and fin can; the drogue parts the last two at 5 s, the main takes the nose at 20 s.
const DUAL: Airframe = {
  body: 0,
  assemblyId: null,
  carrierId: null,
  sections: [section(0, 0.1, 'nose'), section(0.1, 0.4, 't1', 'main'), section(0.4, 0.8, 't2', 'drogue')],
  joints: [
    { opens: 20, cord: 1, deviceIds: ['main'] },
    { opens: 5, cord: 2, deviceIds: ['drogue'] },
  ],
};
const poseAt = (frame: Airframe, t: number, lie = 0) =>
  airframePose(frame, openingOrder(frame), t, lie, newAirframePose(frame), newAirframePose(frame));
const foreOf = (frame: Airframe, t: number, k: number) => {
  const end = { x: 0, y: 0 };
  foreEnd(frame, poseAt(frame, t), k, end);
  return end;
};

describe('how an airframe hangs', () => {
  it('is whole until a joint opens, and starts from there', () => {
    for (const t of [0, 5, 5.0001]) {
      poseAt(DUAL, t).sections.forEach((s, k) => {
        expect(s.x).toBeCloseTo(DUAL.sections[k]!.aft, 3);
        expect(s.y).toBeCloseTo(0, 3);
        expect(s.angle).toBeCloseTo(0, 3);
      });
    }
  });

  it('keeps the back section put and turns the front over beside its end of the cord', () => {
    const { sections, joints } = poseAt(DUAL, 18);
    expect(sections[2]).toEqual({ x: 0.8, y: 0, angle: 0 });
    expect(joints[1]).toMatchObject({ x: expect.closeTo(0.4 - 2, 6), aside: 0 });
    expect(Math.cos(sections[1]!.angle)).toBeLessThan(-0.95);
    expect(sections[1]!.y).toBeGreaterThan(0.03);
    expect(sections[1]!.x).toBeGreaterThan(-1.6);
    // The nose still on it.
    const front = foreOf(DUAL, 18, 1);
    expect(sections[0]).toMatchObject({ x: expect.closeTo(front.x, 9), angle: sections[1]!.angle });
  });

  it('hangs it all from the main once that is out, the drogue aside on the cord below', () => {
    const { sections, joints } = poseAt(DUAL, 40);
    // Right way up again, a cord above the back section.
    expect(sections[1]).toMatchObject({ x: expect.closeTo(0.4 - 2, 6), y: 0, angle: 0 });
    expect(joints[1]).toMatchObject({ x: expect.closeTo(0.4 - 1, 6), aside: 1 });
    expect(joints[0]).toMatchObject({ x: expect.closeTo(-1.6 - 0.3 - 1, 6), aside: 0 });
    expect(Math.cos(sections[0]!.angle)).toBeLessThan(-0.95);
  });

  it('never jumps', () => {
    let last = poseAt(DUAL, 4.9);
    for (let t = 4.9; t < 25; t += 0.01) {
      const now = poseAt(DUAL, t);
      now.sections.forEach((s, k) => {
        expect(Math.abs(s.x - last.sections[k]!.x)).toBeLessThan(0.15);
        expect(Math.abs(s.angle - last.sections[k]!.angle)).toBeLessThan(0.15);
      });
      last = now;
    }
  });

  it('hangs what an earlier front joint let go on down from the turned-over section', () => {
    const noseFirst: Airframe = {
      ...DUAL,
      joints: [
        { ...DUAL.joints[0]!, opens: 5 },
        { ...DUAL.joints[1]!, opens: 20 },
      ],
    };
    const { sections, joints } = poseAt(noseFirst, 40);
    const front = foreOf(noseFirst, 40, 1);
    expect(sections[0]!.x).toBeCloseTo(front.x - Math.cos(sections[1]!.angle), 6);
    expect(sections[0]!.x).toBeGreaterThan(front.x);
    expect(joints[0]!.aside).toBe(1);
  });

  it('reaches over its front by its cords, and past its back where the cord is short', () => {
    expect(poseReach(DUAL, poseAt(DUAL, 0)).above).toBeCloseTo(0, 9);
    expect(poseReach(DUAL, poseAt(DUAL, 40)).above).toBeCloseTo(2.9, 1);
    const short: Airframe = {
      ...DUAL,
      sections: [section(0, 1, 'nose'), section(1, 1.1, 't1')],
      joints: [{ opens: 5, cord: 0.2, deviceIds: [] }],
    };
    expect(poseReach(short, poseAt(short, 30)).below).toBeGreaterThan(0.5);
  });

  it('lies each section its own way on the ground, what is still joined together', () => {
    const turned = (k: number) => poseAt(DUAL, 18, 1).sections[k]!.angle - poseAt(DUAL, 18).sections[k]!.angle;
    expect(Math.abs(turned(1))).toBeGreaterThan(0.05);
    expect(turned(0)).toBeCloseTo(turned(1), 9);
    expect(turned(2)).toBe(0);
  });
});

const motion = (landsAt = 100): DrawnMotion => ({
  tumbleFrom: Infinity,
  tumbleRate: 0,
  tumbleAxis: new THREE.Vector3(),
  landsAt,
  lies: new THREE.Vector3(1, 0, 0),
  side: Math.PI / 2,
  lie: (t) => (t > landsAt ? 1 : 0),
});

const pieceIn = (angle: number, index: number): Piece =>
  ({
    key: `p${index}`,
    id: 'side-tube',
    copies: [
      {
        id: 'side',
        index,
        matrix: new THREE.Matrix4().makeRotationX(angle).multiply(new THREE.Matrix4().makeTranslation(0, 0.1, 0)),
      },
    ],
  }) as unknown as Piece;

describe('the copies of a strap-on', () => {
  const frame: Airframe = {
    ...DUAL,
    body: 1,
    assemblyId: 'side',
    sections: [section(0, 0.1, 'side-nose'), section(0.1, 0.4, 'side-tube', 'c')],
    joints: [{ opens: 5, cord: 1, deviceIds: ['c'] }],
  };
  const places: CopyPlace[] = assemblyCopies([pieceIn(0, 0), pieceIn(Math.PI, 1), pieceIn(0, 0)], 'side');
  const rig = new AirframeRig(frame, places, motion(), 0.02, 0.5);
  const tied = (copy: number, t: number) => {
    rig.update(t);
    return rig.tie(copy, 0, 0, new THREE.Vector3());
  };

  it('are told apart', () => {
    expect(places.map((p) => p.path)).toEqual(['side#0', 'side#1']);
  });

  it('spread under their canopies, and lie side by side', () => {
    expect(tied(0, 5.001).distanceTo(tied(1, 5.001).clone())).toBeCloseTo(0.2, 2);
    const [a, b] = [tied(0, 30), tied(1, 30)];
    expect(a.distanceTo(b)).toBeCloseTo(1.15, 6);
    expect(a.x).toBeCloseTo(0.1 - 1, 6);
    const [c, d] = [tied(0, 101), tied(1, 101)];
    expect(Math.abs(c.z - d.z)).toBeCloseTo(1.15, 6);
    expect(c.y).toBeCloseTo(d.y, 6);
  });

  it('each have their own device', () => {
    const shape = { kind: 'parachute', mouth: 0.5, lines: 6, lineLength: 1, color: '' } as RecoveryShape;
    const d: Deployment = { device: { id: 'c', type: 'parachute' } as ComponentNode, body: 1, from: 5, to: 100 };
    const hung = hungDevices([d], [shape], [rig]);
    expect(hung.map((h) => h.group)).toEqual(['1/side#0', '1/side#1']);
    rig.update(30);
    expect(hung[1]!.tie!(new THREE.Vector3()).distanceTo(tied(1, 30))).toBe(0);
  });
});

describe('a device that opens nothing', () => {
  const rig = new AirframeRig(DUAL, onAxis(), motion(), 0.02, 0.5);
  const shape = { kind: 'streamer', length: 1, width: 0.05, color: '' } as RecoveryShape;
  const at = (id: string, body = 0): Deployment => ({
    device: { id, type: 'streamer' } as ComponentNode,
    body,
    from: 5,
    to: 100,
  });

  it('is tied to the upper end of its own section', () => {
    const frame = { ...DUAL, joints: DUAL.joints.map((j) => ({ ...j, deviceIds: [] })) };
    const closed = new AirframeRig(frame, onAxis(), motion(), 0.02, 0.5);
    const [h] = hungDevices([at('drogue')], [shape], [closed]);
    closed.update(40);
    expect(h!.tie!(new THREE.Vector3()).x).toBeCloseTo(0.4, 9);
    expect(h!.aside()).toBe(0);
  });

  it('is tied to the front of a body that stays whole', () => {
    expect(hungDevices([at('x', 1)], [shape], [rig])[0]!.tie).toBeNull();
  });

  it('leans aside once another holds its section up', () => {
    const [h] = hungDevices([at('drogue')], [shape], [rig]);
    rig.update(10);
    expect(h!.aside()).toBe(0);
    rig.update(40);
    expect(h!.aside()).toBe(1);
  });

  it('leaves the onboard camera the part still there', () => {
    expect(rig.foreAt(4)).toBeUndefined();
    expect(rig.foreAt(10)).toBe(0.4);
  });
});

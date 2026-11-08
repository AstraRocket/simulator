import type { ComponentNode } from '../../../engine/openRocketEngine';
import { IN, fmt, type Cdx1Writer } from './units';
import { aftRadius, finXml, partName } from './sustainer';
import { KeyedError } from '../../../i18n/keyedError';
import { bodyTubeRadius } from '../../../tree/nodeProps';
import { isFinSet } from '../../../tree/tubefins';
import { isChainType } from '../../../tree/componentKinds';
import { partLength } from '../../../tree/position';
import { profileEnds } from '../../../tree/shapeProfile';
import { mathEquals } from '../../motors/mathEquals';

const tubeRadius = bodyTubeRadius;

const finSetsOf = (node: ComponentNode): ComponentNode[] => (node.children ?? []).filter((k) => isFinSet(k.type));

/** Held to desktop `BoosterDTO`'s refusals (error11 to error16, error31, error32). `nozzles` is in inches. */
export function writeBoosters(w: Cdx1Writer, stagesIn: ComponentNode[], nozzles: readonly number[]): void {
  const { emit } = w;
  for (let i = 1; i < stagesIn.length; i++) {
    const st = stagesIn[i]!;
    const stage = partName(st);
    const lastStage = i === stagesIn.length - 1;
    const kids = (st.children ?? []).filter((c) => isChainType(c.type));
    if (kids.length === 0) throw new KeyedError('errors.rasaero.boosterNoTube', { stage });
    const first = kids[0]!;
    if (first.type !== 'bodytube' && first.type !== 'transition') {
      throw new KeyedError('errors.rasaero.boosterFirstPart', { stage, name: partName(first) });
    }

    let shoulder: ComponentNode | null = null;
    let firstTube = first;
    if (first.type === 'transition') {
      const second = kids[1];
      if (!second || second.type !== 'bodytube') {
        throw new KeyedError('errors.rasaero.boosterShoulderTube', { stage, name: partName(first) });
      }
      const above = (stagesIn[i - 1]!.children ?? []).filter((c) => isChainType(c.type)).at(-1);
      const ends = profileEnds(first);
      if (!above || !mathEquals(ends.fore, aftRadius(above))) {
        throw new KeyedError('errors.rasaero.boosterShoulderFore', { stage, name: partName(first) });
      }
      if (!mathEquals(tubeRadius(second), ends.aft)) {
        throw new KeyedError('errors.rasaero.boosterShoulderAft', { stage, name: partName(first) });
      }
      shoulder = first;
      firstTube = second;
    }

    const tubes = [firstTube];
    let boattail: ComponentNode | null = null;
    for (let j = kids.indexOf(firstTube) + 1; j < kids.length; j++) {
      const c = kids[j]!;
      if (c.type === 'bodytube' && mathEquals(tubeRadius(c), tubeRadius(firstTube))) {
        tubes.push(c);
        continue;
      }
      const tail = c.type === 'transition' && j === kids.length - 1;
      if (tail && lastStage) {
        boattail = c;
        break;
      }
      throw new KeyedError(tail ? 'errors.rasaero.boosterBoattail' : 'errors.rasaero.boosterTubeSize', { stage });
    }

    const finParent = tubes.find((p) => finSetsOf(p).length > 0);
    if (!finParent) throw new KeyedError('errors.rasaero.boosterNoFins', { stage, name: partName(firstTube) });
    for (const other of kids.filter((p) => p !== finParent)) {
      for (const fin of finSetsOf(other)) {
        if (fin.type === 'tubefinset')
          throw new KeyedError('errors.rasaero.tubeFinsUnsupported', { name: partName(fin) });
        w.warn({ key: 'errors.exportRasaeroExtraFins', values: { name: partName(fin), part: partName(other) } });
      }
    }

    const bodyLen = tubes.reduce((s, t) => s + partLength(t), 0);
    const shoulderLen = shoulder ? partLength(shoulder) : 0;
    const btLen = boattail ? partLength(boattail) : 0;
    emit('<Booster>');
    emit('<PartType>Booster</PartType>');
    emit(`<Length>${fmt(bodyLen * IN)}</Length>`);
    emit(`<Diameter>${fmt(tubeRadius(firstTube) * 2 * IN)}</Diameter>`);
    emit(
      `<InsideDiameter>${fmt((shoulder ? profileEnds(shoulder).fore : tubeRadius(firstTube)) * 2 * IN)}</InsideDiameter>`,
    );
    emit('<LaunchLugDiameter>0</LaunchLugDiameter>');
    emit('<LaunchLugLength>0</LaunchLugLength>');
    emit('<RailGuideDiameter>0</RailGuideDiameter>');
    emit('<RailGuideHeight>0</RailGuideHeight>');
    emit('<LaunchShoeArea>0</LaunchShoeArea>');
    // Shoulder included, as `BoosterDTO` writes `firstChild.getAxialOffset(ABSOLUTE)`.
    emit(`<Location>${fmt(w.locM * IN)}</Location>`);
    emit('<Color>Black</Color>');
    emit(`<ShoulderLength>${fmt(shoulderLen * IN)}</ShoulderLength>`);
    // RASAero writes the first and reads the second, so `BoosterDTO` writes both.
    emit(`<NozzleExitDiameter>${fmt(nozzles[i] ?? 0)}</NozzleExitDiameter>`);
    emit(`<NozzleDiameter>${fmt(nozzles[i] ?? 0)}</NozzleDiameter>`);
    emit(`<BoattailLength>${fmt(btLen * IN)}</BoattailLength>`);
    emit(`<BoattailRearDiameter>${fmt(boattail ? profileEnds(boattail).aft * 2 * IN : 0)}</BoattailRearDiameter>`);
    const ahead = kids.slice(0, kids.indexOf(finParent));
    // RASAero measures fin Location from the bottom of the whole body (`BoosterDTO` `finLocationOffset`).
    const behind = tubes.slice(tubes.indexOf(finParent) + 1).reduce((s, t) => s + partLength(t), 0);
    finXml(w, finParent, w.locM + ahead.reduce((s, c) => s + partLength(c), 0), behind);
    emit('</Booster>');
    w.locM += shoulderLen + bodyLen + btLen;
  }
}

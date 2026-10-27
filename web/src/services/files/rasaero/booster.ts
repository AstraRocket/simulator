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

/**
 * Boosters (each lower stage) as <Booster> elements, held to the rules of
 * desktop's `BoosterDTO`, so a design that file cannot describe is refused
 * rather than written as a different booster:
 *
 * - the stage starts with a body tube, or with a transition (the shoulder into
 *   the stage above) followed by one (error11, error12), whose ends meet the
 *   part above and that tube exactly (error13 to error15);
 * - consecutive tubes of the first tube's radius are one booster body, and the
 *   first part after them that is not one ends it: a trailing transition on the
 *   last stage is its boat tail, and anything else refuses the export (error31,
 *   error32, "boat tails can only be added to the last stage");
 * - the body carries the fin set (error16).
 *
 * A booster has one fin set, the first on its body, as desktop takes the first
 * it finds; a fin set anywhere else in the stage is left out with a warning,
 * as one past the first on a tube is (see finXml).
 *
 * `nozzles` is each stage's nozzle exit diameter (in), written as both
 * <NozzleExitDiameter> and <NozzleDiameter>: RASAero writes a booster's value
 * under the first and reads it from the second, so desktop's `BoosterDTO`
 * writes both.
 */
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

    // A fin set on the shoulder or the boat tail is not on the body RASAero has.
    const finParent = tubes.find((p) => finSetsOf(p).length > 0);
    if (!finParent) throw new KeyedError('errors.rasaero.boosterNoFins', { stage, name: partName(firstTube) });
    for (const other of kids.filter((p) => p !== finParent)) {
      for (const fin of finSetsOf(other)) {
        // Tube fins are refused wherever they are, as finXml refuses them.
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
    // Where the booster's first part starts, its shoulder when it has one, as
    // desktop's `BoosterDTO` writes `firstChild.getAxialOffset(ABSOLUTE)`.
    emit(`<Location>${fmt(w.locM * IN)}</Location>`);
    emit('<Color>Black</Color>');
    emit(`<ShoulderLength>${fmt(shoulderLen * IN)}</ShoulderLength>`);
    emit(`<NozzleExitDiameter>${fmt(nozzles[i] ?? 0)}</NozzleExitDiameter>`);
    emit(`<NozzleDiameter>${fmt(nozzles[i] ?? 0)}</NozzleDiameter>`);
    emit(`<BoattailLength>${fmt(btLen * IN)}</BoattailLength>`);
    emit(`<BoattailRearDiameter>${fmt(boattail ? profileEnds(boattail).aft * 2 * IN : 0)}</BoattailRearDiameter>`);
    // Where the fin set's tube starts from the nose tip: the stage's start plus
    // the parts ahead of it in the stage.
    const ahead = kids.slice(0, kids.indexOf(finParent));
    // The booster is one body as long as all its tubes, and RASAero measures
    // the fin's Location from that body's bottom, so the tubes after the one
    // the fins are on lie between them, as desktop's `BoosterDTO` adds them
    // (`finLocationOffset`).
    const behind = tubes.slice(tubes.indexOf(finParent) + 1).reduce((s, t) => s + partLength(t), 0);
    finXml(w, finParent, w.locM + ahead.reduce((s, c) => s + partLength(c), 0), behind);
    emit('</Booster>');
    w.locM += shoulderLen + bodyLen + btLen;
  }
}

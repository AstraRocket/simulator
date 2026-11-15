import { describe, it, expect } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { exportOrk } from '../../../src/services/files/orkExport';
import { wireLoadedOrk } from '../../../src/services/files/wireLoadedOrk';
import type { LoadedOrk } from '../../../src/services/files/loadOrk';
import type { LaunchConditions } from '../../../src/services/design/orkTree';

const node = (o: object) => o as unknown as ComponentNode;

const absoluteTree = () =>
  ({
    components: [
      node({ type: 'nosecone', id: 'nose', length: 0.3, outerRadius: 0.012 }),
      node({
        type: 'bodytube',
        id: 'body',
        length: 0.4,
        outerRadius: 0.012,
        children: [
          node({
            type: 'trapezoidfinset',
            id: 'fins',
            rootChord: 0.05,
            position: { method: 'absolute', offset: 0.35 },
          }),
        ],
      }),
    ],
  }) as unknown as RocketTree;

const xmlFor = (tree: RocketTree) => exportOrk({ name: 'Rocket', tree } as never);

describe('exportOrk: imported absolute positions', () => {
  const load = (tree: RocketTree) =>
    wireLoadedOrk(
      {
        name: 'Rocket',
        notes: [],
        tree,
        motors: {},
        configs: [{ id: 'cfg-1', name: null, motors: {} }],
        chosenConfigId: 'cfg-1',
      } as unknown as LoadedOrk,
      {} as unknown as LaunchConditions,
    ).tree;

  it('writes the original absolute offset back out, unchanged', () => {
    const xml = xmlFor(load(absoluteTree()));
    expect(xml).toContain('<axialoffset method="absolute">0.35</axialoffset>');
    expect(xml).toContain('<position type="absolute">0.35</position>');
  });

  it('round-trips the axial offsets byte-for-byte', () => {
    const before = xmlFor(absoluteTree());
    const after = xmlFor(load(absoluteTree()));
    const offsets = (s: string) => s.match(/<(?:axialoffset|position)[^>]*>[^<]*<\/(?:axialoffset|position)>/g);
    expect(offsets(after)).toEqual(offsets(before));
  });

  it('writes the CURRENT position once the user has moved the part', () => {
    const tree = load(absoluteTree());
    const fins = tree.components[1]!.children![0]! as ComponentNode;
    fins.position = { ...fins.position!, offset: 0.42 };

    const xml = xmlFor(tree);
    expect(xml).toContain('<axialoffset method="absolute">0.42</axialoffset>');
    expect(xml).not.toContain('>0.35<');
  });
});

describe('exportOrk - the drogue flag', () => {
  const chuteTree = (drogue?: boolean) =>
    ({
      components: [
        node({ type: 'nosecone', id: 'nose', length: 0.3, outerRadius: 0.012 }),
        node({
          type: 'bodytube',
          id: 'body',
          length: 0.4,
          outerRadius: 0.012,
          children: [node({ type: 'parachute', id: 'chute', diameter: 0.3, ...(drogue == null ? {} : { drogue }) })],
        }),
      ],
    }) as unknown as RocketTree;

  it('writes the element only for a drogue, as the desktop saver does', () => {
    expect(xmlFor(chuteTree(true))).toContain('<isdrogue>true</isdrogue>');
    // RecoveryDeviceSaver omits it entirely for a main.
    expect(xmlFor(chuteTree(false))).not.toContain('isdrogue');
    expect(xmlFor(chuteTree())).not.toContain('isdrogue');
  });
});

describe('exportOrk - a blank launch field', () => {
  const blank = (): LaunchConditions =>
    ({
      launchRodLengthM: null,
      launchRodAngleDeg: null,
      windAverage: null,
      windStdDev: null,
      launchAltitudeM: null,
      latitudeDeg: null,
    }) as unknown as LaunchConditions;

  const xml = () => exportOrk({ name: 'Rocket', tree: absoluteTree(), launch: blank() } as never);

  it('never writes the literal string "null" into the file', () => {
    expect(xml()).not.toContain('>null<');
  });

  it('writes zero for each of the five nullable conditions', () => {
    const out = xml();
    for (const tag of ['launchrodlength', 'launchrodangle', 'launchaltitude', 'speed', 'standarddeviation']) {
      expect(out).toContain(`<${tag}>0</${tag}>`);
    }
  });

  it('writes a cleared site as the default site, not 0 (a point off Ecuador)', () => {
    const out = xml();
    expect(out).toContain('<launchlatitude>28.61</launchlatitude>');
    expect(out).toContain('<launchlongitude>-80.6</launchlongitude>');
  });
});

describe('exportOrk - a pod set or booster the user never named', () => {
  it("is saved under desktop's own name for a new one", () => {
    const tube = (id: string, children: ComponentNode[] = []) =>
      node({ id, type: 'bodytube', length: 0.3, outerRadius: 0.02, thickness: 0.001, children });
    const tree = {
      name: 'R',
      components: [
        node({
          id: 's',
          type: 'stage',
          children: [
            tube('core', [
              node({ id: 'p', type: 'podset', instanceCount: 2, children: [tube('pod')] }),
              node({ id: 'b', type: 'parallelstage', instanceCount: 2, children: [tube('boost')] }),
            ]),
          ],
        }),
      ],
    } as unknown as RocketTree;
    const out = xmlFor(tree);
    // core/src/main/resources/l10n/messages.properties: PodSet.PodSet, BoosterSet.BoosterSet.
    expect(out).toContain('<name>Pod Set</name>');
    expect(out).toContain('<name>Booster Set</name>');
  });
});

describe('exportOrk - the conditions desktop reads from its preferences when absent', () => {
  const launch = (over: Partial<LaunchConditions>) =>
    ({ launchRodLengthM: 1, temperatureC: 20, pressureHPa: 1000, relativeHumidity: null, ...over }) as LaunchConditions;
  const out = (over: Partial<LaunchConditions>) =>
    exportOrk({ name: 'Rocket', tree: absoluteTree(), launch: launch(over) } as never);

  it('writes the WGS gravity model, as OpenRocketSaver does', () => {
    expect(out({})).toContain('<gravity model="wgs"/>');
    expect(out({ gravityModel: 'constant', constantGravity: 9.8 } as Partial<LaunchConditions>)).not.toContain(
      'model="wgs"',
    );
  });

  it('writes a humidity in an extended atmosphere, the one the kernel flies when none is set', () => {
    // ExtendedISAModel.STANDARD_RELATIVE_HUMIDITY.
    expect(out({})).toContain('<baserelativehumidity>0</baserelativehumidity>');
    expect(out({ relativeHumidity: 0.4 })).toContain('<baserelativehumidity>0.4</baserelativehumidity>');
  });
});

// cspell:ignore randomseed simulationsteppermethod recoveryspeedwarning droguelowspeedwarning Lowspeedwarning recoverydroguemainhighspeedwarning recoverydroguemainlowspeedwarning -- OpenRocket .ork element names
import type { ComponentNode, RocketTree } from '../../../engine/openRocketEngine';
import { KeyedError } from '../../../i18n/keyedError';
import { MAX_PASSTHROUGH } from './importLimits';
import { BAYS_TAG, MAIN_TAG, NOTES_TAG } from './appTags';

/** A tag we write but leave out here is emitted twice. */
export const KNOWN_COMPONENT_TAGS: ReadonlySet<string> = new Set([
  'name',
  'id',
  'comment',
  'linestyle',
  'preset',
  'color',
  BAYS_TAG,
  MAIN_TAG,
  'appearance',
  'insideappearance',
  'finish',
  'material',
  'linematerial',
  'filletmaterial',
  'position',
  'axialoffset',
  'angleoffset',
  'radiusoffset',
  'radialposition',
  'radialdirection',
  'instancecount',
  'instanceseparation',
  'rotation',
  'subcomponents',
  'stage',
  'motormount',
  'deploymentconfiguration',
  'separationconfiguration',
  'shape',
  'shapeparameter',
  'shapeclipped',
  'length',
  'thickness',
  'radius',
  'innerradius',
  'outerradius',
  'innerdiameter',
  'outerdiameter',
  'diameter',
  'foreradius',
  'aftradius',
  'isflipped',
  'filled',
  'foreshoulderradius',
  'foreshoulderlength',
  'foreshoulderthickness',
  'foreshouldercapped',
  'aftshoulderradius',
  'aftshoulderlength',
  'aftshoulderthickness',
  'aftshouldercapped',
  'fincount',
  'rootchord',
  'tipchord',
  'sweeplength',
  'height',
  'cant',
  'crosssection',
  'finpoints',
  'point',
  'tabheight',
  'tablength',
  'tabposition',
  'filletradius',
  'clusterconfiguration',
  'clusterscale',
  'clusterrotation',
  'maxmotorlength',
  'cd',
  'linecount',
  'linelength',
  'linelengthauto',
  'cordlength',
  'cordlengthauto',
  'striplength',
  'stripwidth',
  'width',
  'spillholediameter',
  'packedlength',
  'packedradius',
  'deployevent',
  'deployaltitude',
  'deploydelay',
  'isdrogue',
  'mass',
  'masscomponenttype',
  'baseheight',
  'flangeheight',
  'screwheight',
  'nozzleexitdiameter',
  'separationevent',
  'separationdelay',
  'separationaltitude',
  'overridemass',
  'overridecg',
  'overridecd',
  'overridesubcomponents',
  'overridesubcomponentsmass',
  'overridesubcomponentscg',
  'overridesubcomponentscd',
  'airfoilsection',
  'airfoillediamond',
  'airfoiltediamond',
  'finleradius',
  'caseairframe',
  'fairingshape',
]);

export const KNOWN_ROCKET_TAGS: ReadonlySet<string> = new Set([
  'name',
  'id',
  'comment',
  'designer',
  'kitname',
  'revision',
  NOTES_TAG,
  'designtype',
  'referencetype',
  'customreference',
  'motorconfiguration',
  'subcomponents',
  'axialoffset',
  'position',
]);

export const KNOWN_DOCUMENT_TAGS: ReadonlySet<string> = new Set(['rocket', 'simulations', 'designinfo']);

export const KNOWN_SIMULATION_TAGS: ReadonlySet<string> = new Set([
  'name',
  'simulator',
  'calculator',
  'conditions',
  'flightdata',
]);

/** Lower case. */
export const KNOWN_CONDITIONS_TAGS: ReadonlySet<string> = new Set([
  'configid',
  'launchrodlength',
  'launchintowind',
  'launchrodangle',
  'launchroddirection',
  'windaverage',
  'windturbulence',
  'winddirection',
  'wind',
  'windmodeltype',
  'launchaltitude',
  'launchlatitude',
  'launchlongitude',
  'geodeticmethod',
  'simulationsteppermethod',
  'atmosphere',
  'launchrelativehumidity',
  'gravity',
  'gravitymodel',
  'constantgravity',
  'weathersource',
  'forecastlevel',
  'timestep',
  'maxtime',
  'recoveryspeedwarning',
  'droguelowspeedwarning',
  'recoverydroguemainhighspeedwarning',
  'recoverydroguemainlowspeedwarning',
]);

export const wrapConditionsChild = (raw: string): string => `<conditions>${raw}</conditions>`;

export function unwrapConditionsChild(raw: string): string | null {
  const open = '<conditions>';
  const close = '</conditions>';
  return raw.startsWith(open) && raw.endsWith(close) ? raw.slice(open.length, -close.length) : null;
}

export const EXTRA_KEY = 'xmlExtra';

export const ROCKET_EXTRA_KEY = 'xmlExtra';
export const DOC_EXTRA_KEY = 'docExtra';

export function readPassthrough(el: Element, known: ReadonlySet<string> = KNOWN_COMPONENT_TAGS): string[] | undefined {
  const xml: string[] = [];
  const serializer = new XMLSerializer();
  for (const child of Array.from(el.children)) {
    if (known.has(child.tagName.toLowerCase())) continue;
    if (xml.length === MAX_PASSTHROUGH) throw new KeyedError('errors.file.tooManyUnknownElements');
    xml.push(serializer.serializeToString(child));
  }
  return xml.length ? xml : undefined;
}

export function passthroughOf(holder: ComponentNode | RocketTree, key: string = EXTRA_KEY): string[] {
  const v = (holder as unknown as Record<string, unknown>)[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

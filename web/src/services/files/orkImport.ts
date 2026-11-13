import i18n from '../../i18n';
import { readDesignNotes } from './ork/orkDesignNotes';
import { xmlText as text } from './xmlUtil';
import { syncAutoRadii } from '../design/autoRadius';
import { findStages } from '../design/treeEdit';
import type { OrkImportResult } from './orkTypes';
import { parseOrkXml, unpackOrk } from './ork/importUnpack';
import { readFlightConfigs, readStageActiveness, type OrkImportContext } from './ork/importConfigs';
import { readStages } from './ork/importReaders';
import { KNOWN_DOCUMENT_TAGS, KNOWN_ROCKET_TAGS, readPassthrough } from './ork/passthrough';
import { takeDocumentMaterials } from './ork/docMaterials';
import { readLaunchConditions } from './ork/importLaunch';
import { readSimulations } from './ork/importSimulations';
import { configNotes, ignoredNotes } from './ork/importNotes';
import { keyedNote, noteList, type ImportNote } from './importNote';
import { KeyedError, type Keyed } from '../../i18n/keyedError';

// eslint-disable-next-line complexity -- a flat sequence of reads from one document
export function importOrk(data: ArrayBuffer | string): OrkImportResult {
  const archive = unpackOrk(data);
  const doc = parseOrkXml(archive.xml);
  const rocketEl = doc.querySelector('openrocket > rocket');
  if (!rocketEl) throw new KeyedError('errors.file.notOrk');

  const name = text(rocketEl, ':scope > name') ?? i18n.t('library.untitled');
  const designer = text(rocketEl, ':scope > designer') ?? undefined;
  const kitName = text(rocketEl, ':scope > kitname') ?? undefined;
  const comment = text(rocketEl, ':scope > comment') ?? undefined;
  const revision = text(rocketEl, ':scope > revision') ?? undefined;
  const designType = text(rocketEl, ':scope > designtype')?.toLowerCase() ?? undefined;
  const refType = text(rocketEl, ':scope > referencetype')?.toLowerCase();
  const referenceType = refType && refType !== 'maximum' ? refType : undefined;
  const customRef = Number(text(rocketEl, ':scope > customreference'));
  const customReference = Number.isFinite(customRef) && customRef > 0 ? customRef : undefined;
  const rocketExtra = readPassthrough(rocketEl, KNOWN_ROCKET_TAGS);
  const docEl = doc.querySelector('openrocket');
  // Before passthrough, so materials are not also carried as raw XML.
  const docMaterials = docEl ? takeDocumentMaterials(docEl) : { materials: [], skipped: 0 };
  const docExtra = docEl ? readPassthrough(docEl, KNOWN_DOCUMENT_TAGS) : undefined;
  const stages = Array.from(rocketEl.querySelectorAll(':scope > subcomponents > stage'));
  if (stages.length === 0) throw new KeyedError('errors.file.noStage');

  const { configEls, configs, chosenConfigId } = readFlightConfigs(rocketEl);
  const ctx: OrkImportContext = {
    configs,
    chosenConfigId,
    notes: [],
    ignored: new Set<string>(),
    motors: {},
    motor: undefined,
    nodeCount: 0,
  };

  const simulations = readSimulations(doc);

  // Resolved now: downstream reads a plain radius, and an unresolved `auto` draws at a default.
  const components = syncAutoRadii({ name, components: readStages(ctx, stages) }).components;
  if (components.every((s) => (s.children ?? []).length === 0)) {
    throw new KeyedError('errors.file.noComponents');
  }
  readStageActiveness(
    configEls,
    configs,
    findStages({ name, components }).map((n) => n.id as string),
  );
  const { notes, ignored } = ctx;
  notes.push(...versionNotes(doc));
  notes.push(...ignoredNotes(ignored));
  notes.push(...configNotes(rocketEl, configs));
  notes.push(...archiveNotes(doc, archive.dropped));
  if (docMaterials.skipped) {
    notes.push(keyedNote('importNote.docMaterialsSkipped', { count: docMaterials.skipped }));
  }
  // The bridge always measures calibers against the widest body tube, so the margin can differ.
  if (referenceType) notes.push(keyedNote('importNote.referenceType', { type: referenceType }));

  const launch = readLaunchConditions(doc);

  return {
    name,
    tree: {
      name,
      components,
      ...(designer ? { designer } : {}),
      ...(kitName ? { kitName } : {}),
      ...(comment ? { comment } : {}),
      ...(revision ? { revision } : {}),
      ...readDesignNotes(rocketEl),
      ...(designType ? { designType } : {}),
      ...(referenceType ? { referenceType } : {}),
      ...(customReference !== undefined ? { customReference } : {}),
      ...(rocketExtra ? { xmlExtra: rocketExtra } : {}),
      ...(docExtra ? { docExtra } : {}),
      ...(docMaterials.materials.length ? { documentMaterials: docMaterials.materials } : {}),
    },
    motor: ctx.motor,
    motors: ctx.motors,
    configs,
    chosenConfigId,
    ignored: [...ignored],
    notes,
    ...(launch ? { launch } : {}),
    ...(simulations.length ? { simulations } : {}),
    ...(archive.motorFiles.length ? { embeddedMotors: archive.motorFiles } : {}),
  };
}

/** Desktop's `DocumentConfig.SUPPORTED_VERSIONS`. */
const SUPPORTED_ORK_VERSIONS: ReadonlySet<string> = new Set([
  '1.0',
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '1.6',
  '1.7',
  '1.8',
  '1.9',
  '1.10',
  '1.11',
]);

function versionNotes(doc: Document): ImportNote[] {
  const root = doc.querySelector('openrocket');
  const version = root?.getAttribute('version')?.trim() || null;
  if (version !== null && SUPPORTED_ORK_VERSIONS.has(version)) return [];
  const creator = root?.getAttribute('creator')?.trim();
  if (version && creator) return [keyedNote('importNote.versionUnsupportedBy', { version, creator })];
  if (version) return [keyedNote('importNote.versionUnsupported', { version })];
  if (creator) return [keyedNote('importNote.versionMissingBy', { creator })];
  return [keyedNote('importNote.versionMissing')];
}

const EXTENSION_NAMES: Readonly<Record<string, string | { key: string }>> = {
  AirStart: { key: 'importNote.extensionName.airStart' },
  RollControl: 'Roll Control',
  StopSimulation: 'Stop Simulation',
  PrintSimulation: 'Print Simulation Values',
  DampingMoment: 'Damping moment coefficient (Cdm) (built-in)',
  JavaCode: { key: 'importNote.extensionName.javaCode' },
  ScriptingExtension: { key: 'importNote.extensionName.script' },
};

function extensionName(id: string, el: Element): string | Keyed {
  const cls = id.trim().split('.').pop() || 'unnamed';
  // Own keys only: "constructor" from the file must not read Object.prototype.
  const name = Object.hasOwn(EXTENSION_NAMES, cls) ? EXTENSION_NAMES[cls]! : cls;
  if (typeof name === 'string') return name;
  const language =
    [...el.querySelectorAll(':scope > entry')].find((e) => e.getAttribute('key') === 'language')?.textContent?.trim() ||
    'JavaScript';
  return { key: name.key, values: { language } };
}

function archiveNotes(doc: Document, dropped: string[]): ImportNote[] {
  const out: ImportNote[] = [];
  const decals = doc.querySelectorAll('decal').length;
  if (decals) {
    out.push(keyedNote('importNote.decals', { total: decals }));
  }
  const extensions = [
    ...doc.querySelectorAll(
      'openrocket > simulations > simulation > extension, openrocket > simulations > simulation > listener',
    ),
  ];
  if (extensions.length) {
    const seen = new Set<string>();
    const names = extensions
      .map((e) => extensionName(e.getAttribute('extensionid') ?? e.textContent ?? '', e))
      .filter((n) => {
        const id = JSON.stringify(n);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    out.push(keyedNote('importNote.extensions', { names: noteList(names) }));
  }
  if (dropped.length) {
    out.push(keyedNote('importNote.notRead', { items: noteList(dropped.slice(0, 6), { more: dropped.length > 6 }) }));
  }
  const docLevel = ['photostudio', 'docprefs', 'datatypes'].filter((t) => {
    const el = doc.querySelector(`openrocket > ${t}`);
    return el && (t !== 'docprefs' || el.children.length > 0);
  });
  if (docLevel.length) {
    out.push(keyedNote('importNote.noEditor', { items: noteList(docLevel) }));
  }
  return out;
}

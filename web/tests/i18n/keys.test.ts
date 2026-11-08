import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import en from '../../src/i18n/locales/en.json';
import { DEPLOY_EVENTS, FIELDS } from '../../src/services/design/componentFields';
import { REQUIRED_COMPONENT_FIELDS } from '../../src/services/design/requiredComponent';
import { MATERIAL_SLOTS } from '../../src/services/design/materialSlots';
import { PART_KEYS } from '../../src/services/design/partColors';
import { THEME_PREFS } from '../../src/services/app/theme';
import { HEADER_SUMMARY_PREFS, STATS_LAYOUTS } from '../../src/services/storage/settings';
import { DESIGN_VIEWS, RESULT_VIEWS, TOOLS } from '../../src/state/tabs';
import { SIMPLE_FIN_SHAPES } from '../../src/services/flight/simpleRocket';
import { FIN_MATERIALS } from '../../src/services/flight/finFlutter';
import { TEST_RESULTS } from '../../src/services/flight/recoveryBays';
import { EXHAUST_IDS } from '../../src/services/motors/exhaust';
import { SPARKY_CHOICES } from '../../src/services/motors/motorDb';
import { EXPORT_FORMATS } from '../../src/services/exports/flightPathExport';
import { EXPORT_PRESETS } from '../../src/services/exports/pathExportPresets';
import { PROPOSAL_GROUPS } from '../../src/services/weather/weatherProposal';
import { QUANTITIES, UNIT_CHOICES } from '../../src/prefs/units';
import { COLUMNS } from '../../src/components/sim/motorColumns';
import { REQUIRED_LAUNCH_KEYS } from '../../src/services/flight/requiredLaunch';
import { DESIGN_TYPES } from '../../src/engine/openRocketEngine';
import { LINE_STYLES } from '../../src/services/design/figureStyle';

// Both suites parse every file under src; a loaded CI runner is ~10x slower.
vi.setConfig({ testTimeout: 60_000 });

type Tree = { [k: string]: string | Tree };

function flatten(node: Tree, prefix = '', out: string[] = []): string[] {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(key);
    else flatten(v, key, out);
  }
  return out;
}

function sourceFiles(): [string, string][] {
  const root = join(__dirname, '../../src');
  const files: [string, string][] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'locales' || name === 'vendor') continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        files.push([relative(root, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
      }
    }
  };
  walk(root);
  return files;
}

function sourceText(): string {
  return sourceFiles()
    .map(([, text]) => text)
    .join('\n');
}

const fieldTables = Object.values(FIELDS).flat();
const FIELD_OPTIONS = (family: string) =>
  fieldTables.flatMap((f) => (f.kind === 'select' && f.optI18n === family ? f.options : []));

function kernelWarningKeys(): string[] {
  const root = join(__dirname, '../../../engine-java/src/java/info/openrocket/core');
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.java'))
        for (const m of readFileSync(p, 'utf8').matchAll(/"Warning\.([A-Za-z0-9_.]+)"/g)) keys.add(m[1]!);
    }
  };
  walk(root);
  return [...keys];
}
const KERNEL_WARNINGS = kernelWarningKeys();

const NOSE_SHAPES = FIELD_OPTIONS('noseShape');

const DYNAMIC_FAMILIES: { prefix: string; values: readonly string[] }[] = [
  // ComponentType in engine/openRocketEngine.ts is a type, not a value.
  {
    prefix: 'part.',
    values: [
      'stage',
      'nosecone',
      'transition',
      'bodytube',
      'trapezoidfinset',
      'ellipticalfinset',
      'freeformfinset',
      'tubefinset',
      'innertube',
      'tubecoupler',
      'centeringring',
      'bulkhead',
      'engineblock',
      'launchlug',
      'railbutton',
      'fairing',
      'parachute',
      'streamer',
      'shockcord',
      'masscomponent',
      'podset',
      'parallelstage',
    ],
  },
  { prefix: 'part.field.', values: Object.values(REQUIRED_COMPONENT_FIELDS).flat() },
  {
    prefix: 'settings.materialSlot.',
    values: MATERIAL_SLOTS.map(({ part, material }) => (material === 'bulk' ? part : `${part}_${material}`)),
  },
  { prefix: 'settings.themeOption.', values: THEME_PREFS },
  { prefix: 'settings.headerSummaryOption.', values: HEADER_SUMMARY_PREFS },
  { prefix: 'settings.statsLayoutOption.', values: STATS_LAYOUTS },
  { prefix: 'settings.part.', values: PART_KEYS },
  {
    prefix: 'view.',
    values: [
      ...DESIGN_VIEWS,
      ...RESULT_VIEWS,
      ...['side', 'aft'].flatMap((v) => [v, `${v}Title`]),
      ...['top', 'bottom', 'left', 'right'].flatMap((s) => [`ruler_${s}`, `ruler_${s}_abbr`]),
    ],
  },
  {
    prefix: 'schematic.tag.',
    values: [
      'parachute',
      'streamer',
      'shockcord',
      'masscomponent',
      'centeringring',
      'bulkhead',
      'engineblock',
      'tubecoupler',
      'innertube',
    ],
  },
  { prefix: 'pathExport.fmt.', values: EXPORT_FORMATS.map((f) => f.id) },
  { prefix: 'pathExport.preset.', values: EXPORT_PRESETS.flatMap((p) => [p.id, `${p.id}Note`]) },
  {
    prefix: 'pathExport.doc.',
    values: [
      'rocket',
      'time',
      'configuration',
      'launchSite',
      'latLon',
      'aboveSeaLevel',
      'abovePad',
      'fromThePad',
      'maxAltitude',
      'maxVelocity',
      'maxAcceleration',
      'maxRange',
      'timeToApogee',
      'flightTime',
      'altitude',
      'position',
      'coordinates',
      'landing',
      'device',
      'flightPath',
      'groundTrack',
    ],
  },
  { prefix: 'deployEvent.', values: [...FIELD_OPTIONS('deployEvent'), ...DEPLOY_EVENTS] },
  { prefix: 'crossSection.', values: FIELD_OPTIONS('crossSection') },
  { prefix: 'finish.', values: FIELD_OPTIONS('finish') },
  { prefix: 'prop.lineStyle_', values: LINE_STYLES },
  { prefix: 'massComponentType.', values: FIELD_OPTIONS('massComponentType') },
  { prefix: 'separationEvent.', values: FIELD_OPTIONS('separationEvent') },
  { prefix: 'radiusMethod.', values: FIELD_OPTIONS('radiusMethod') },
  { prefix: 'tabOffsetMethod.', values: FIELD_OPTIONS('tabOffsetMethod') },
  { prefix: 'noseShape.', values: NOSE_SHAPES },
  { prefix: 'shapeDesc.', values: ['nosecone', 'transition'].flatMap((p) => NOSE_SHAPES.map((s) => `${p}.${s}`)) },
  { prefix: 'weather.group.', values: PROPOSAL_GROUPS },
  {
    prefix: 'weather.error.',
    values: ['offline', 'timeout', 'aborted', 'refused', 'badKey', 'quota', 'http', 'shape', 'units', 'noData'],
  },
  { prefix: 'weather.dateRefusal.', values: ['tooFarAhead', 'tooEarly', 'badDate'] },
  {
    prefix: 'env.q.',
    values: ['windSpeed', 'windDirection', 'temperature', 'pressure', 'density', 'speedOfSound'],
  },
  { prefix: 'landing.recovery_', values: ['single', 'dual'] },
  { prefix: 'tools.tool_', values: TOOLS },
  { prefix: 'flutterTool.material_', values: FIN_MATERIALS.map((m) => m.key) },
  { prefix: 'flutterTool.verdict_', values: ['over', 'marginal', 'ok'] },
  { prefix: 'finFlutter.warning_', values: ['over', 'marginal'] },
  { prefix: 'ejectionBay.saved_', values: ['main', 'drogue'] },
  { prefix: 'charges.role_', values: ['main', 'drogue'] },
  { prefix: 'bays.result_', values: TEST_RESULTS },
  { prefix: 'exhaust.look_', values: EXHAUST_IDS },
  { prefix: 'exhaust.about_', values: EXHAUST_IDS },
  { prefix: 'simpleTool.finShape_', values: SIMPLE_FIN_SHAPES },
  { prefix: 'positionFrom.', values: ['top', 'middle', 'bottom', 'absolute'] },
  { prefix: 'units.q.', values: QUANTITIES },
  { prefix: 'dash.', values: COLUMNS.map((c) => c.label) },
  { prefix: 'motorDlg.sparky_', values: SPARKY_CHOICES },
  { prefix: 'launchDocs.cert_', values: ['0', '1', '2', '3'] },
  {
    prefix: 'prop.',
    values: [
      ...fieldTables.map((f) => f.label),
      ...fieldTables.flatMap((f) => (f.auto ? [f.auto.tip] : [])),
      'splitFins',
      'splitPods',
      'splitBoosters',
      'density',
    ],
  },
  {
    prefix: 'tree.',
    values: ['groupBody', 'groupFins', 'groupInner', 'groupRecovery', 'groupOther', 'groupAssembly'],
  },
  {
    prefix: 'windProfile.',
    values: [
      'msl',
      'agl',
      'mslShort',
      'aglShort',
      ...['emptyFile', 'missingColumns', 'shortRow', 'badNumber', 'noData'].map((k) => `csv.${k}`),
    ],
  },
  {
    prefix: 'launch.turbulenceLevel.',
    values: ['none', 'veryLow', 'low', 'medium', 'high', 'veryHigh', 'extreme'],
  },
  { prefix: 'launch.windModel_', values: ['average', 'multilevel'] },
  { prefix: 'launch.field.', values: REQUIRED_LAUNCH_KEYS },
  { prefix: 'recovery.verdict.', values: ['slow', 'main', 'between', 'drogue', 'fast'] },
  { prefix: 'motorDlg.', values: ['typeSU', 'typeReload', 'typeHybrid'] },
  { prefix: 'ignition.', values: ['automatic', 'launch', 'ejectioncharge', 'burnout', 'never'] },
  { prefix: 'export.units_', values: UNIT_CHOICES },
  { prefix: 'config.type_', values: DESIGN_TYPES },
  { prefix: 'warn.', values: KERNEL_WARNINGS },
  { prefix: 'warnHelp.', values: KERNEL_WARNINGS },
  { prefix: 'backup.lib.', values: ['materials', 'parts', 'locations', 'motors', 'templates', 'settings'] },
  { prefix: 'myMaterials.type.', values: ['bulk', 'surface', 'line'] },
  {
    prefix: 'material.groups.',
    values: [
      'Metals',
      'Woods',
      'Plastics',
      'Fabrics',
      'Paper',
      'PaperProducts',
      'Foams',
      'Composites',
      'Fibers',
      'Elastics',
      'Kevlars',
      'Nylons',
      'Other',
      'Custom',
      'Adhesives',
    ],
  },
];

const DYNAMIC_KEYS = new Set(DYNAMIC_FAMILIES.flatMap((f) => f.values.map((v) => f.prefix + v)));

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

// `withLauncher` passes the launcher as i18next context.
const LAUNCHER_SUFFIX = /_(rail|rod)$/;

const KNOWN_DEAD: string[] = [];

describe('en.json keys', () => {
  it('are each referenced literally in src, or built by a listed dynamic family', () => {
    const src = sourceText();
    const referenced = (key: string) =>
      src.includes(`'${key}'`) || src.includes(`"${key}"`) || src.includes(`\`${key}\``);
    const dead = flatten(en as Tree).filter((full) => {
      const key = full.replace(PLURAL_SUFFIX, '');
      // Try the key itself first: `tools.tool_rail` is a real key, not a variant.
      const live = (k: string) => referenced(k) || DYNAMIC_KEYS.has(k) || KNOWN_DEAD.includes(k);
      return !live(key) && !live(key.replace(LAUNCHER_SUFFIX, ''));
    });
    expect(dead).toEqual([]);
  });

  it('every listed dynamic family is actually built somewhere', () => {
    const src = sourceText();
    const unbuilt = DYNAMIC_FAMILIES.map((f) => f.prefix).filter((p) => {
      const stem = p.replace(/[._]$/, '');
      return !src.includes(`\`${p}`) && !src.includes(`'${stem}'`) && !src.includes(`'${p}'`);
    });
    expect(unbuilt).toEqual([]);
  });
});

const LEAVES = new Set(flatten(en as Tree));
const ALL_LEAVES = [...LEAVES];
const OBJECTS = new Set<string>();
(function collectObjects(node: Tree, prefix: string) {
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    OBJECTS.add(key);
    collectObjects(v, key);
  }
})(en as Tree, '');
const NAMESPACES = new Set(Object.keys(en));

// i18next joins plural (`_one`) and context (`_noWrap`) forms to the base with `_`.
const isLeafKey = (key: string) => LEAVES.has(key) || ALL_LEAVES.some((l) => l.startsWith(`${key}_`));

const looksLikeKey = (s: string) => {
  const m = /^([A-Za-z]+)(\.[A-Za-z0-9_]+)+$/.exec(s);
  return m !== null && NAMESPACES.has(m[1]!);
};

type Miss = { file: string; line: number; key: string };

function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isSatisfiesExpression(e)
  )
    e = e.expression;
  return e;
}

function constTables(sf: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const out = new Map<string, ts.ObjectLiteralExpression>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = unwrap(d.initializer);
      if (ts.isObjectLiteralExpression(init)) out.set(d.name.text, init);
    }
  }
  return out;
}

function findMissingKeys(): Miss[] {
  const parsed = sourceFiles().map(([file, text]) => ({
    file,
    sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true),
  }));
  const local = new Map(parsed.map(({ file, sf }) => [file, constTables(sf)]));
  // An imported table resolves only when its name is unique across src.
  const global = new Map<string, ts.ObjectLiteralExpression | null>();
  for (const tables of local.values())
    for (const [name, obj] of tables) global.set(name, global.has(name) ? null : obj);

  const missing: Miss[] = [];
  for (const { file, sf } of parsed) {
    const tables = local.get(file)!;
    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const requireLeaf = (n: ts.Node, key: string) => {
      if (!isLeafKey(key)) missing.push({ file, line: lineOf(n), key });
    };
    const requirePrefix = (n: ts.Node, head: string) => {
      if (!ALL_LEAVES.some((l) => l.startsWith(head))) missing.push({ file, line: lineOf(n), key: `${head}\${...}` });
    };

    const checkArg = (raw: ts.Expression) => {
      const e = unwrap(raw);
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) requireLeaf(e, e.text);
      else if (ts.isTemplateExpression(e)) {
        if (e.head.text) requirePrefix(e, e.head.text);
      } else if (ts.isConditionalExpression(e)) {
        checkArg(e.whenTrue);
        checkArg(e.whenFalse);
      } else if (
        ts.isBinaryExpression(e) &&
        (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
      ) {
        checkArg(e.left);
        checkArg(e.right);
      } else if (
        (ts.isElementAccessExpression(e) || ts.isPropertyAccessExpression(e)) &&
        ts.isIdentifier(e.expression)
      ) {
        const table = tables.get(e.expression.text) ?? global.get(e.expression.text);
        for (const prop of table?.properties ?? []) {
          if (ts.isPropertyAssignment(prop)) {
            const v = unwrap(prop.initializer);
            if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) requireLeaf(v, v.text);
          }
        }
      }
    };

    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.arguments[0]) {
        const callee = n.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : '';
        if (name === 't') checkArg(n.arguments[0]);
      } else if (ts.isJsxAttribute(n) && n.name.getText() === 'i18nKey' && n.initializer) {
        if (ts.isStringLiteral(n.initializer)) requireLeaf(n.initializer, n.initializer.text);
      } else if (
        ts.isPropertyAssignment(n) &&
        /Key$/.test(n.name.getText()) &&
        (ts.isStringLiteral(n.initializer) || ts.isNoSubstitutionTemplateLiteral(n.initializer))
      ) {
        requireLeaf(n.initializer, n.initializer.text);
      } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looksLikeKey(n.text)) {
        if (!isLeafKey(n.text) && !OBJECTS.has(n.text)) missing.push({ file, line: lineOf(n), key: n.text });
      } else if (ts.isTemplateExpression(n) && looksLikeKey(n.head.text.replace(/[._]$/, ''))) {
        requirePrefix(n, n.head.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const seen = new Set<string>();
  return missing.filter((m) => {
    const id = `${m.file}:${m.line}:${m.key}`;
    return seen.has(id) ? false : (seen.add(id), true);
  });
}

describe('keys named in src', () => {
  it('each exist in en.json (or as plural or context forms of one)', () => {
    const missing = findMissingKeys().map((m) => `${m.file}:${m.line} ${m.key}`);
    expect(missing).toEqual([]);
  });
});

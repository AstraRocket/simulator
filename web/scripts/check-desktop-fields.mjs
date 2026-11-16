// Usage: npm run check:fields -- <samples dir>. Needs `npm run openrocket:build`.
// KNOWN is checked both ways: a new difference fails, and so does an entry that no longer occurs.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineBuild } from './lib/openrocketJava.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCES = [
  resolve(HERE, 'ork-check/OrkFields.java'),
  resolve(HERE, '../../engine-java/src/api/java/api/ComponentFields.java'),
];
const CATALOG_DIGESTS = new Set(
  JSON.parse(readFileSync(resolve(HERE, '../public/data/motors.generated.json'), 'utf8')).flatMap((m) =>
    (m.digests ?? []).map((e) => e.digest),
  ),
);

// `when(app, desktop, appFields, desktopFields)` must confirm this is the difference the entry names.
const KNOWN = [
  {
    rule: 'rkt:*.instanceCount',
    why: "RockSim has no repeat count (desktop's own export drops it too), so the writer names the part in its skipped list",
    when: (a, d) => a > 1 && d === 1,
  },
  {
    rule: 'rkt:launchlug.instanceSeparation',
    why: 'RockSim has no spacing element (LaunchLugDTO writes none), so LaunchLugHandler keeps the constructor spacing',
    when: (a, d) => d === 0.06,
  },
  {
    rule: 'rkt:*.massOverridden',
    why: 'RockSim has no airfoil section, so an airfoil fin set goes out as its kernel mass and CG (CalcMass, CalcCG)',
    when: (a, d, af) => af.crossSection === 'airfoil' && d === true,
  },
  {
    rule: 'rkt:*.cgOverridden',
    why: 'an airfoil fin set goes out as its kernel mass and CG',
    when: (a, d, af) => af.crossSection === 'airfoil' && d === true,
  },
  {
    rule: 'rkt:*.cgOverridden',
    why: "RockSim overrides mass and CG together, so a mass-only override goes out with the part's own CG, as desktop's own export writes it",
    when: (a, d, af) => af.massOverridden === true && !af.cgOverridden && d === true,
  },
  {
    rule: 'rkt:masscomponent.massOverridden',
    why: "RockSim overrides mass and CG together, so a CG-only override goes out with the part's own mass, as desktop's own export writes it",
    when: (a, d, af) => af.cgOverridden === true && !af.massOverridden && d === true,
  },
  {
    rule: 'rkt:masscomponent.overrideCGX',
    why: "MassObjectHandler puts a mass object's CG at its front: a RockSim mass object is a point",
    when: (a, d) => d === 0,
  },
  {
    rule: 'rkt:*.finish',
    why: "RockSim's finish codes have no rough; it goes out as the nearest, unfinished",
    when: (a, d) => a === 'rough' && d === 'unfinished',
  },
  ...['massOverridden', 'overrideMass', 'overrideSubcomponentsMass'].map((key) => ({
    rule: `rkt:stage.${key}`,
    why: "RockSim's stage overrides are all or nothing (`RockSimSaver.setStageOverrides`), so one override states every stage's weighed mass",
    when: (a, d, af, df) => af.massOverridden !== true && df.massOverridden === true,
  })),
  ...['cgOverridden', 'overrideCGX', 'overrideSubcomponentsCG'].map((key) => ({
    rule: `rkt:stage.${key}`,
    why: "RockSim's stage overrides are all or nothing (`RockSimSaver.setStageOverrides`), so one override states every stack's weighed CG",
    when: (a, d, af, df) => af.cgOverridden !== true && df.cgOverridden === true,
  })),
  ...['nosecone.shoulderCapped', 'transition.foreShoulderCapped', 'transition.aftShoulderCapped'].map((key) => ({
    rule: `rkt:${key}`,
    why: 'RockSim has no capped shoulder; `Transition.setForeShoulderLength` and its aft twin cap a shoulder as they give it a length',
    when: (a, d) => a === false && d === true,
  })),
  {
    rule: 'rkt:launchlug.thickness',
    why: 'no element sets a lug wall; LaunchLugHandler keeps the 1 mm default',
    when: (a, d) => d === 0.001,
  },
  {
    rule: 'rkt:*.ignitionEvent',
    why: "RockSim has no mount ignition, and desktop's RockSim importer reads none, so the mount keeps the automatic default",
    when: (a, d) => d === 'automatic',
  },
  {
    rule: 'rkt:*.ignitionDelay',
    why: "RockSim has no mount ignition, and desktop's RockSim importer reads none, so the mount keeps no delay",
    when: (a, d) => d === 0,
  },
  {
    rule: 'rkt:masscomponent.massComponentType',
    why: 'RockSim has no mass component type',
    when: (a, d) => d === 'masscomponent',
  },
  { rule: 'rkt:masscomponent.radius', why: 'MassObjectHandler does not read Dia', when: (a, d) => d === 0.0125 },
  {
    rule: 'rkt:*.cdOverridden',
    why: 'RockSim has no drag coefficient override, so the writer names the part in its skipped list',
    when: (a, d) => a === true && d === false,
  },
  {
    rule: 'rkt:*.overrideCD',
    why: "RockSim has no drag coefficient override; desktop reports the part's own computed drag",
    when: (a, d, af) => af.cdOverridden === true,
  },
  {
    rule: 'rkt:*.deployDelay',
    why: "deployment is only in RockSim's simulation events, which desktop does not import",
    when: (a, d) => d === 0,
  },
  {
    rule: 'rkt:stage.separationDelay',
    why: "separation is only in RockSim's simulation results, which desktop does not import",
    when: (a, d) => d === 0,
  },
  {
    rule: 'rkt:transition.clipped',
    why: "RockSim has no clip flag; TransitionHandler keeps Transition()'s clipped shape",
    when: (a, d) => d === true,
  },
  {
    rule: 'rkt:*.filletRadius',
    why: 'RockSim has no fin fillet',
    when: (a, d) => d === 0,
  },
  {
    rule: 'rkt:freeformfinset.planformArea',
    why: 'a freeform outline on a tapered parent: FreeformFinSet.setPoints snaps the outline desktop reads from the point list to the root it computes, which moves the area by under 2 %',
    when: (a, d) => Math.abs(a - d) < 0.02 * Math.max(a, d),
  },
  {
    rule: 'rkt:*.outerRadiusAuto',
    why: 'RockSim carries the diameter, not the automatic setting; desktop reads a fixed one',
    when: (a, d) => a === true && d === false,
  },
  {
    rule: 'rkt:*.innerRadiusAuto',
    why: 'RockSim carries the diameter, not the automatic setting; desktop reads a fixed one',
    when: (a, d) => a === true && d === false,
  },
  {
    rule: 'rkt:*.radiusAuto',
    why: 'RockSim carries the packed diameter, not the automatic setting; desktop reads a fixed one',
    when: (a, d) => a === true && d === false,
  },
  {
    rule: 'rkt:*.cdAuto',
    why: 'RockSim carries the drag coefficient, not the automatic setting; desktop reads a fixed one',
    when: (a, d) => a === true && d === false,
  },
  { rule: 'rkt:*.comment', why: 'RockSim has no component comment', when: (a, d) => d === '' },
  {
    rule: 'rkt:*.filletDensity',
    why: "RockSim has no fin fillet, so desktop's fin set keeps the constructor's fillet material",
    when: (a, d) => d === 680,
  },
  {
    rule: 'rkt:*.filletMaterialName',
    why: "RockSim has no fin fillet, so desktop's fin set keeps the constructor's fillet material",
    when: (a, d) => d === 'Cardboard',
  },
  {
    rule: 'rkt:*.deployEvent',
    why: "deployment is only in RockSim's simulation events, which desktop does not import",
    when: (a, d) => d === 'ejection',
  },
  {
    rule: 'rkt:*.deployAltitude',
    why: "deployment is only in RockSim's simulation events, which desktop does not import",
    when: (a, d) => d === 200,
  },
  {
    rule: 'rkt:stage.separationEvent',
    why: "separation is only in RockSim's simulation results, which desktop does not import",
    when: (a, d) => d === 'ejection',
  },
  {
    rule: 'rkt:streamer.length',
    why: 'StreamerHandler reads no packed size; desktop keeps its default',
    when: (a, d) => d === 0.025,
  },
  {
    rule: 'rkt:streamer.radius',
    why: 'StreamerHandler reads no packed size; desktop keeps its default',
    when: (a, d) => d === 0.0125,
  },
  {
    rule: 'ork:config',
    files: ['source/rocksim.rkt'],
    why: "desktop's RockSim import creates no flight configuration; the app mints one so the mounts have an id to key by",
  },
  {
    rule: 'ork:sims',
    files: ['source/rocksim.rkt'],
    why: "desktop's RockSim import creates no simulation; the app adds its default one",
  },
  {
    rule: 'ork:shockcord.materialName',
    why: "a RockSim cord's line has no name (MassObjectHandler), and desktop refuses a .ork material without one, so the writer names it custom",
    when: (a, d) => a === '' && d === 'custom',
  },
  {
    rule: 'ork:config.motor.digest',
    why: 'a file keeps the digest it was saved with on a motor the app did not change, and the bundled examples were saved against an older motor database; desktop finds the motor by name, since ork:config.motor agrees',
    when: (a) => !CATALOG_DIGESTS.has(a),
  },
  {
    rule: 'rkt:nosecone.shoulderThickness',
    why: 'NoseConeHandler takes the wall, or the shoulder radius when solid',
    when: (a, d, af, df) => d === df.thickness || d === df.shoulderRadius,
  },
  {
    rule: 'rkt:transition.foreShoulderThickness',
    why: 'TransitionHandler takes the wall, or the shoulder radius when solid',
    when: (a, d, af, df) => Math.abs(d - df.thickness) < 1e-9 || d === df.foreShoulderRadius,
  },
  {
    rule: 'rkt:transition.aftShoulderThickness',
    why: 'TransitionHandler takes the wall, or the shoulder radius when solid',
    when: (a, d, af, df) => Math.abs(d - df.thickness) < 1e-9 || d === df.aftShoulderRadius,
  },
  {
    rule: 'rkt:parachute.length',
    why: 'ParachuteHandler sizes the pack from the airframe it sits in',
    when: (a, d, af, df) => d === df.radius,
  },
  {
    rule: 'rkt:parachute.radius',
    why: 'ParachuteHandler sizes the pack from the airframe it sits in',
    when: (a, d, af, df) => d === df.length,
  },
  {
    rule: 'rkt:shockcord.length',
    why: 'MassObjectHandler packs a cord at its length / 100',
    when: (a, d, af, df) => Math.abs(d - df.cordLength / 100) < 1e-9,
  },
  {
    rule: 'rkt:shockcord.radius',
    why: "MassObjectHandler sets a cord's radius to the parent's bore",
    when: (a, d) => d > 0,
  },
];

// Relative: a `.rkt` carries millimeters and grams to a few places.
const TOLERANCE = { ork: 1e-6, rkt: 1e-3 };

const dir = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
if (!dir || !existsSync(dir)) {
  console.error('usage: npm run check:fields -- <samples dir>');
  process.exit(2);
}
const samplesIn = (d) =>
  existsSync(d)
    ? readdirSync(d)
        .filter((f) => /\.(ork|rkt)$/.test(f) && existsSync(join(d, `${f}.kernel.json`)))
        .map((f) => join(d, f))
    : [];
const files = [...samplesIn(dir), ...samplesIn(join(dir, 'source'))];
if (!files.length) {
  console.error(`no saved files with a .kernel.json beside them in ${dir}`);
  process.exit(2);
}

const { cp, label } = engineBuild();
console.log(`reading ${files.length} files back in ${label}`);
const work = mkdtempSync(join(tmpdir(), 'or-fields-'));
let desktop;
try {
  execFileSync('javac', ['-cp', cp, '-d', work, ...SOURCES], { stdio: 'inherit' });
  const out = join(work, 'fields.json');
  execFileSync('java', ['-cp', `${cp}${delimiter}${work}`, 'OrkFields', out, ...files], { stdio: 'inherit' });
  desktop = JSON.parse(readFileSync(out, 'utf8'));
} finally {
  rmSync(work, { recursive: true, force: true });
}

const ANGLES = new Set(['angleOffset', 'rotation', 'cant', 'radialDirection', 'clusterRotation']);
const norm = (v) => (typeof v === 'string' ? v.toLowerCase().replace(/_/g, '') : v);
const turn = 2 * Math.PI;
const angleGap = (a, b) => Math.abs(((((a - b) % turn) + 1.5 * turn) % turn) - turn / 2);

function same(key, a, b, tol) {
  if (typeof a === 'number' && typeof b === 'number') {
    const d = ANGLES.has(key) ? angleGap(a, b) : Math.abs(a - b);
    return d <= 1e-9 + tol * Math.max(Math.abs(a), Math.abs(b));
  }
  return norm(a) === norm(b);
}

const sameKind = (type, cls) => (type === 'stage' ? cls === 'AxialStage' : cls.toLowerCase() === type);

const SKIP = new Set(['positionMethod', 'positionOffset']);

const RKT_RESTATED = new Set(['radiusOffset', 'radiusMethod', 'tabOffset', 'tabOffsetMethod']);

// RockSim angles are written in degrees; desktop reads the number as radians.
const asReadRadians = (a) => (a * 180) / Math.PI;
const RKT_ANGLE_SETTERS = {
  // LaunchLug.setAngleOffset clamps; the others reduce to (-pi, pi].
  angleOffset: (a, type) =>
    type === 'launchlug' ? Math.max(-Math.PI, Math.min(Math.PI, asReadRadians(a))) : asReadRadians(a),
  rotation: (a) => asReadRadians(a),
  radialDirection: (a) => asReadRadians(a),
};

const COPY_PLACEMENT = new Set([
  'radialPosition',
  'radialDirection',
  'cluster',
  'clusterScale',
  'clusterRotation',
  'instanceCount',
  'instanceRadius',
  'radiusOffset',
  'radiusMethod',
  'angleOffset',
]);

const FLIPPED_NOSE_AS_TRANSITION = {
  aftRadius: 'foreRadius',
  shoulderLength: 'foreShoulderLength',
  shoulderRadius: 'foreShoulderRadius',
  shoulderThickness: 'foreShoulderThickness',
  shoulderCapped: 'foreShoulderCapped',
  flipped: null,
};

const hasTab = (f) => f.tabHeight > 0 && f.tabLength > 0;
const READ_ONLY_WHEN = {
  tabLength: hasTab,
  tabHeight: hasTab,
  tabOffset: hasTab,
  tabOffsetMethod: hasTab,
  tabOffsetFromFront: hasTab,
  deployAltitude: (f) => f.deployEvent === 'altitude',
  separationAltitude: (f) => String(f.separationEvent).startsWith('altitude'),
  overrideMass: (f) => f.massOverridden === true,
  overrideCGX: (f) => f.cgOverridden === true,
  overrideCD: (f) => f.cdOverridden === true,
};

// Mirrors rktExport; keep the two in step.
function asRockSim(parts) {
  const out = [];
  for (let i = 0; i < parts.length;) {
    const p = parts[i];
    let end = i + 1;
    while (end < parts.length && parts[end].depth > p.depth) end++;
    if (p.type === 'railbutton') {
      i = end;
    } else if (p.rktCopies > 1) {
      const subtree = asRockSim(parts.slice(i + 1, end));
      for (let c = 0; c < p.rktCopies; c++) out.push({ ...p, copy: true }, ...subtree);
      i = end;
    } else if (p.type === 'tubecoupler') {
      out.push(p, ...asRockSim(parts.slice(i + 1, end)).map((kid) => ({ ...kid, depth: kid.depth - 1 })));
      i = end;
    } else if (p.type === 'nosecone' && p.fields.flipped) {
      const fields = {};
      for (const [k, v] of Object.entries(p.fields)) {
        const to = k in FLIPPED_NOSE_AS_TRANSITION ? FLIPPED_NOSE_AS_TRANSITION[k] : k;
        if (to) fields[to] = v;
      }
      out.push({ ...p, type: 'transition', fields });
      i++;
    } else {
      out.push(p);
      i++;
    }
  }
  return out;
}

function rktRestatement(key, k, d) {
  const a = k.fields[key];
  const b = d.fields[key];
  if (key in RKT_ANGLE_SETTERS) return angleGap(RKT_ANGLE_SETTERS[key](a, k.type), b) <= 1e-6;
  // Desktop sizes the pack itself, so only the end RockSim states has to agree.
  if (key === 'positionX' && (k.type === 'parachute' || k.type === 'streamer')) {
    return Math.abs(a + k.fields.length - (b + d.fields.length)) <= 1e-6;
  }
  return false;
}

function compareFlights(name, app, read) {
  const miss = (rule, text, a, d, af) =>
    misses.push({ rule: `ork:${rule}`, file: name, app: a, desktop: d, appFields: af, text: `${name} ${text}` });
  const differ = (rule, where, a, d, key = '') => {
    if (a === undefined) return;
    if (a === null ? d === null || d === undefined : d !== undefined && d !== null && same(key, a, d, TOLERANCE.ork)) {
      return;
    }
    miss(rule, `${where}: app ${a}, desktop ${d}`, a, d);
  };
  const byPart = (list) => new Map(list.map((x) => [x.part, x]));
  for (const ac of app.configs) {
    const dc = read.configs.find((c) => c.id === ac.id);
    if (!dc) {
      miss('config', `configuration ${ac.id}: not read`);
      continue;
    }
    differ('config.default', ac.id, ac.default, dc.default);
    const dm = byPart(dc.motors);
    for (const m of ac.motors) {
      const d = dm.get(m.part);
      if (!d) {
        miss(
          'config.motor',
          `${ac.id} part #${m.part}: app ${m.designation}, desktop no motor`,
          m.designation,
          null,
          m,
        );
        continue;
      }
      // The app's common name (F67) and desktop's full code (F67W) are the same motor.
      if (!same('', m.designation, d.commonName, 0)) {
        differ('config.motor.designation', `${ac.id} part #${m.part}`, m.designation, d.designation);
      }
      for (const k of ['digest', 'delay', 'ignitionEvent', 'ignitionDelay']) {
        differ(`config.motor.${k}`, `${ac.id} part #${m.part}`, m[k], d[k]);
      }
    }
    for (const part of dm.keys()) {
      if (!ac.motors.some((m) => m.part === part)) {
        miss('config.motor', `${ac.id} part #${part}: app no motor, desktop ${dm.get(part).designation}`);
      }
    }
    for (const [list, what] of [
      ['deployments', 'deployment'],
      ['separations', 'separation'],
    ]) {
      const dd = byPart(dc[list]);
      for (const x of ac[list]) {
        const d = dd.get(x.part);
        if (!d) {
          miss(`config.${what}`, `${ac.id} part #${x.part}: not read`);
          continue;
        }
        for (const k of ['event', 'altitude', 'delay'])
          differ(`config.${what}.${k}`, `${ac.id} part #${x.part}`, x[k], d[k]);
      }
    }
    differ('config.stages', ac.id, JSON.stringify(ac.stages), JSON.stringify(dc.stages));
  }
  if (app.sims.length !== read.sims.length) {
    miss('sims', `app ${app.sims.length} simulations, desktop ${read.sims.length}`);
    return;
  }
  app.sims.forEach((as, i) => {
    const ds = read.sims[i];
    differ('sim.name', `simulation #${i}`, as.name, ds.name);
    differ('sim.configId', as.name, as.configId, ds.configId);
    for (const [key, a] of Object.entries(as.conditions)) {
      const d = ds.conditions[key];
      if (a === undefined) continue;
      if (key === 'windLevels') {
        differ('sim.windLevels', `${as.name} wind levels`, a.length, d.length);
        a.forEach((l, j) => {
          for (const k of Object.keys(l)) differ(`sim.windLevels.${k}`, `${as.name} wind level #${j}`, l[k], d[j]?.[k]);
        });
      } else {
        differ(`sim.${key}`, as.name, a, d, ANGLE_CONDITIONS.has(key) ? 'rotation' : key);
      }
    }
  });
}

const ANGLE_CONDITIONS = new Set(['launchRodDirection', 'windDirection']);

const misses = [];
for (const file of files) {
  const name = basename(dirname(file)) === 'source' ? `source/${basename(file)}` : basename(file);
  const format = file.endsWith('.rkt') ? 'rkt' : 'ork';
  const saved = JSON.parse(readFileSync(`${file}.kernel.json`, 'utf8'));
  const kernel = format === 'rkt' ? asRockSim(saved) : saved;
  const read = desktop[file] ?? { parts: [], configs: [], sims: [] };
  if (existsSync(`${file}.app.json`)) {
    compareFlights(name, JSON.parse(readFileSync(`${file}.app.json`, 'utf8')), read);
  }
  const loaded = read.parts;
  const apart = kernel.findIndex(
    (k, i) => !loaded[i] || !sameKind(k.type, loaded[i].class) || k.depth !== loaded[i].depth,
  );
  if (apart >= 0 || loaded.length !== kernel.length) {
    const at = apart >= 0 ? apart : kernel.length;
    misses.push({
      rule: `${format}:part tree`,
      text: `${name}: app ${kernel.length} parts, desktop ${loaded.length}; first apart at #${at}`,
    });
    continue;
  }
  for (let i = 0; i < kernel.length; i++) {
    const k = kernel[i];
    const d = loaded[i];
    for (const [key, value] of Object.entries(k.fields)) {
      if (SKIP.has(key) || !(key in d.fields)) continue;
      if (k.copy && COPY_PLACEMENT.has(key)) continue;
      if (format === 'rkt' && RKT_RESTATED.has(key)) continue;
      if (READ_ONLY_WHEN[key] && !READ_ONLY_WHEN[key](k.fields) && !READ_ONLY_WHEN[key](d.fields)) continue;
      if (same(key, value, d.fields[key], TOLERANCE[format])) continue;
      if (format === 'rkt' && rktRestatement(key, k, d)) continue;
      misses.push({
        rule: `${format}:${k.type}.${key}`,
        anyType: `${format}:*.${key}`,
        app: value,
        desktop: d.fields[key],
        appFields: k.fields,
        desktopFields: d.fields,
        text: `${name} ${k.name || k.type}: app ${value}, desktop ${d.fields[key]}`,
      });
    }
  }
}

const matched = new Set();
const unknown = new Map();
for (const m of misses) {
  const entry = KNOWN.find(
    (e) =>
      (e.rule === m.rule || e.rule === m.anyType) &&
      (!e.files || e.files.includes(m.file)) &&
      (!e.when || e.when(m.app, m.desktop, m.appFields ?? {}, m.desktopFields ?? {})),
  );
  if (entry) matched.add(entry);
  else unknown.set(m.rule, [...(unknown.get(m.rule) ?? []), m.text]);
}
const stale = KNOWN.filter((e) => !matched.has(e));
for (const [rule, lines] of [...unknown.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`DIFFERS ${rule}`);
  for (const l of lines.slice(0, 3)) console.log(`  ${l}`);
  if (lines.length > 3) console.log(`  and ${lines.length - 3} more`);
}
for (const e of stale) console.log(`NO LONGER DIFFERS ${e.rule} (${e.why}): remove it from KNOWN`);
console.log(`${unknown.size} new differences, ${matched.size} known, ${stale.length} stale entries`);
process.exit(unknown.size || stale.length ? 1 : 0);

import type { MotorSpec, RocketTree } from '../../engine/openRocketEngine';
import { catalogDigest, loadCatalog, matchCatalogMotor, sameMaker } from './motorDb';
import { liveMotors, type FlightConfig } from '../flight/flightConfigs';
import type { OrkExportMotor } from '../files/orkFile';
import { embeddedMotorFile } from '../files/ork/embeddedMotors';
import { toCatalogMm } from './catalogUnits';

/**
 * `base` applies only while the mount holds the motor the file named: desktop's findMotors puts a
 * digest match ahead of a name match, so a stale digest flies the wrong motor.
 */
export function buildExportMotorMap(
  tree: RocketTree,
  config: FlightConfig,
  base: Record<string, OrkExportMotor> = {},
): Record<string, OrkExportMotor> {
  const motors: Record<string, OrkExportMotor> = {};
  for (const [id, m] of liveMotors(tree, config)) {
    if (!m.spec.designation) continue;
    const captured = base[id];
    motors[id] = {
      ...(captured && namesSeated(captured, m.spec) ? captured : {}),
      designation: m.spec.designation,
      ...(m.spec.manufacturer ? { manufacturer: m.spec.manufacturer } : {}),
      diameter: m.spec.diameter,
      length: m.spec.length,
      delay: m.spec.ejectionDelay,
      ignitionEvent: m.ignitionEvent,
      ignitionDelay: m.ignitionDelay,
      seated: m.spec,
    };
  }
  return motors;
}

/** Desktop files name the full code (`H128W`); the spec keeps the common name (`H128`) and code. */
function namesSeated(ref: OrkExportMotor, spec: MotorSpec): boolean {
  const norm = (s: string) => s.trim().toLowerCase();
  const named = norm(ref.designation);
  if (named !== norm(spec.designation) && named !== norm(spec.code ?? '')) return false;
  if (ref.delay !== spec.ejectionDelay) return false;
  if (!ref.manufacturer || !spec.manufacturer) return true;
  return norm(ref.manufacturer) === norm(spec.manufacturer);
}

const DIAMETER_TOLERANCE_MM = 1;

/**
 * A catalog row is used only on an undoubted match with the same maker: desktop lets a digest win
 * whatever the maker. A checksum matching nothing makes desktop report the motor as changed.
 */
export async function fillMotorDigests(
  motors: Record<string, OrkExportMotor>,
): Promise<Record<string, OrkExportMotor>> {
  let catalog;
  try {
    // Bundled rows only: an imported motor would match its own digest-less row.
    catalog = (await loadCatalog()).filter((row) => row.custom !== true);
  } catch {
    return motors;
  }
  const out: Record<string, OrkExportMotor> = {};
  for (const [id, m] of Object.entries(motors)) {
    // Diameter: Quest's 13 and 18 mm A3. Full code: AeroTech's F67C and F67W are both F67.
    const sized = catalog.filter((row) => Math.abs(row.diameter - toCatalogMm(m.diameter)) <= DIAMETER_TOLERANCE_MM);
    const match = matchCatalogMotor(sized, m.seated?.code || m.designation, m.manufacturer);
    const maker = m.manufacturer?.trim().toLowerCase();
    const row =
      !m.seated?.imported && match && !match.doubt && maker && sameMaker(match.motor.manufacturer, maker)
        ? match.motor
        : undefined;
    const digest = row ? catalogDigest(row, m.delay) : undefined;
    const embedded = !row && m.seated ? embeddedMotorFile(m.seated) : null;
    out[id] = embedded ? { ...m, embedded, digest: embedded.digest } : digest ? { ...m, digest } : m;
  }
  return out;
}

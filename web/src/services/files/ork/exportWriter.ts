import type { OrkExportMotor, OrkDeployOverride, OrkSepOverride } from '../orkTypes';
import type { ComponentFigures } from '../rktExport';

export interface OrkWriteConfig {
  id: string;
  name: string | null;
  motors: Record<string, OrkExportMotor>;
  deployments: Record<string, OrkDeployOverride> | null;
  separations: Record<string, OrkSepOverride> | null;
  grounded: string[];
}

export interface OrkWriter {
  emit: (depth: number, s: string) => void;
  writeConfigs: OrkWriteConfig[];
  defaultId: string;
  componentInfo?: ComponentFigures;
  /** Each decal image's archive path, from `decalPaths`. */
  decalPaths?: ReadonlyMap<string, string>;
}

export function createOrkWriter(
  writeConfigs: OrkWriteConfig[],
  defaultId: string,
  componentInfo?: ComponentFigures,
  decalPaths?: ReadonlyMap<string, string>,
): OrkWriter & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    emit: (depth, s) => lines.push('  '.repeat(depth) + s),
    writeConfigs,
    defaultId,
    componentInfo,
    decalPaths,
  };
}

import type { RevisionEntry, RocketTree } from '../../../engine/openRocketEngine';
import { escapeXml } from '../xmlUtil';
import { NOTES_TAG } from './appTags';

/** Notes desktop has no field for. It ignores this element, and drops it if it saves the file. */

type DesignNotes = Pick<RocketTree, 'kitManufacturer' | 'kitPartNumber' | 'revisionLog'>;

const isEntry = (v: unknown): v is RevisionEntry => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e['id'] === 'string' &&
    typeof e['date'] === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(e['date']) &&
    typeof e['note'] === 'string'
  );
};

const filled = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

// Picks named fields only: the element is file content, and one bad field should not lose the others.
export function readDesignNotes(rocketEl: Element): DesignNotes {
  const child = Array.from(rocketEl.children).find((c) => c.tagName.toLowerCase() === NOTES_TAG);
  if (!child?.textContent) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(child.textContent);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const { kitManufacturer, kitPartNumber, revisionLog } = parsed as Record<string, unknown>;
  const entries = Array.isArray(revisionLog) ? revisionLog.filter(isEntry) : [];
  return {
    ...(filled(kitManufacturer) ? { kitManufacturer } : {}),
    ...(filled(kitPartNumber) ? { kitPartNumber } : {}),
    ...(entries.length ? { revisionLog: entries } : {}),
  };
}

export function designNotesXml({ kitManufacturer, kitPartNumber, revisionLog }: RocketTree): string | null {
  if (!kitManufacturer && !kitPartNumber && !revisionLog?.length) return null;
  const notes: DesignNotes = {
    ...(kitManufacturer ? { kitManufacturer } : {}),
    ...(kitPartNumber ? { kitPartNumber } : {}),
    ...(revisionLog?.length ? { revisionLog } : {}),
  };
  return `<${NOTES_TAG}>${escapeXml(JSON.stringify(notes))}</${NOTES_TAG}>`;
}

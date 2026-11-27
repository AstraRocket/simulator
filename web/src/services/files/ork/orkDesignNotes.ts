import type { RevisionEntry, RocketTree } from '../../../engine/openRocketEngine';
import { escapeXml } from '../xmlUtil';
import { NOTES_TAG } from './appTags';
import { childEl, childrenEl, childText, leaf, type XmlLine } from './xmlLines';

/**
 * Notes desktop has no field for. It ignores this element, and drops it if it saves the file:
 *
 *   <designnotes>
 *     <kitmanufacturer>Estes</kitmanufacturer>
 *     <kitpartnumber>K-1</kitpartnumber>
 *     <revisionlog>
 *       <revision id="a"><date>YYYY-MM-DD</date><note>New fins</note></revision>
 *     </revisionlog>
 *   </designnotes>
 */

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

// One bad field or entry should not lose the others.
export function readDesignNotes(rocketEl: Element): DesignNotes {
  const child = childEl(rocketEl, NOTES_TAG);
  if (!child) return {};
  const kitManufacturer = childText(child, 'kitmanufacturer');
  const kitPartNumber = childText(child, 'kitpartnumber');
  const log = childEl(child, 'revisionlog');
  const entries = (log ? childrenEl(log, 'revision') : [])
    .map((r) => ({
      id: r.getAttribute('id') ?? '',
      date: childText(r, 'date')?.trim(),
      note: childText(r, 'note') ?? '',
    }))
    .filter(isEntry);
  return {
    ...(filled(kitManufacturer) ? { kitManufacturer } : {}),
    ...(filled(kitPartNumber) ? { kitPartNumber } : {}),
    ...(entries.length ? { revisionLog: entries } : {}),
  };
}

export function designNotesXml({ kitManufacturer, kitPartNumber, revisionLog }: RocketTree): XmlLine[] {
  if (!kitManufacturer && !kitPartNumber && !revisionLog?.length) return [];
  return [
    [0, `<${NOTES_TAG}>`],
    ...(kitManufacturer ? [leaf(1, 'kitmanufacturer', kitManufacturer)] : []),
    ...(kitPartNumber ? [leaf(1, 'kitpartnumber', kitPartNumber)] : []),
    ...(revisionLog?.length
      ? [
          [1, '<revisionlog>'] as const,
          ...revisionLog.flatMap((e): XmlLine[] => [
            [2, `<revision id="${escapeXml(e.id)}">`],
            leaf(3, 'date', e.date),
            leaf(3, 'note', e.note),
            [2, '</revision>'],
          ]),
          [1, '</revisionlog>'] as const,
        ]
      : []),
    [0, `</${NOTES_TAG}>`],
  ];
}

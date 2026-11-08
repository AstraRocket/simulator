import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { str } from '../../tree/nodeProps';
import { richText } from './richText';

export function ShapeDescription({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  if (node.type !== 'nosecone' && node.type !== 'transition') return null;
  const shape = str(node, 'shape', node.type === 'nosecone' ? 'ogive' : 'conical');
  const key = `shapeDesc.${node.type}.${shape}`;
  const text = t(key, { defaultValue: '' });
  if (!text || text === key) return null;
  return (
    <p className="rounded-md bg-raised/60 px-2 py-1.5 text-[11px] leading-snug text-ink-muted ring-1 ring-line/5">
      {richText(text)}
    </p>
  );
}

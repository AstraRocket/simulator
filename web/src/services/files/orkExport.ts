import { asStageNodes } from '../design/orkTree';
import { designNotesXml } from './ork/orkDesignNotes';
import { findStages } from '../design/treeEdit';
import { escapeXml } from './xmlUtil';
import { uuid } from '../app/uuid';
import { appName } from '../app/appInfo';
import type { OrkTreeExportInput } from './orkTypes';
import { createOrkWriter } from './ork/exportWriter';
import { motorConfigurationsXml, resolveWriteConfigs } from './ork/exportMotorConfigs';
import { stageXml } from './ork/exportWriters';
import { simulationsXml } from './ork/exportSimulation';
import { designInfoXml } from './ork/exportDesignInfo';
import { DOC_EXTRA_KEY, ROCKET_EXTRA_KEY, passthroughOf } from './ork/passthrough';
import { withDocumentMaterialsXml } from './ork/docMaterials';
import { documentMaterialsOf } from '../materials/documentMaterials';

export function exportOrk({
  name,
  tree,
  launch,
  simulations,
  simPrefs,
  configs,
  activeConfigId,
  designInfo,
  componentInfo,
}: OrkTreeExportInput): string {
  const { writeConfigs, defaultId } = resolveWriteConfigs({ configs, activeConfigId });
  const w = createOrkWriter(writeConfigs, defaultId, componentInfo);
  const { emit } = w;

  emit(0, "<?xml version='1.0' encoding='utf-8'?>");
  emit(0, `<openrocket version="1.10" creator="${escapeXml(appName())}">`);
  emit(1, '<rocket>');
  emit(2, `<name>${escapeXml(name)}</name>`);
  emit(2, `<id>${uuid()}</id>`);
  emit(2, '<axialoffset method="absolute">0.0</axialoffset>');
  emit(2, '<position type="absolute">0.0</position>');
  const metaField = (key: 'comment' | 'designer' | 'revision') => {
    const v = tree[key];
    if (typeof v === 'string' && v.trim()) emit(2, `<${key}>${escapeXml(v)}</${key}>`);
  };
  metaField('comment');
  metaField('designer');
  if (typeof tree.kitName === 'string' && tree.kitName.trim()) emit(2, `<kitname>${escapeXml(tree.kitName)}</kitname>`);
  metaField('revision');
  const designNotes = designNotesXml(tree);
  if (designNotes) emit(2, designNotes);
  emit(2, `<designtype>${escapeXml(tree.designType || 'original')}</designtype>`);
  for (const raw of passthroughOf(tree, ROCKET_EXTRA_KEY)) emit(2, raw);
  const stageNodes = asStageNodes(tree);
  // Ids, not a count: configurations address stages by node id.
  motorConfigurationsXml(
    w,
    2,
    findStages(tree).map((n) => n.id),
  );
  // The file's own reference: a hardcoded `maximum` would re-measure a custom-length design.
  emit(2, `<referencetype>${escapeXml(tree.referenceType || 'maximum')}</referencetype>`);
  if (typeof tree.customReference === 'number' && tree.customReference > 0) {
    emit(2, `<customreference>${tree.customReference}</customreference>`);
  }
  emit(2, '<subcomponents>');
  for (let i = 0; i < stageNodes.length; i++) {
    stageXml(w, 3, stageNodes[i]!, i);
  }
  emit(2, '</subcomponents>');
  emit(1, '</rocket>');
  simulationsXml(w, 1, launch, simulations, simPrefs);
  designInfoXml(w, 1, designInfo);
  for (const raw of withDocumentMaterialsXml(passthroughOf(tree, DOC_EXTRA_KEY), documentMaterialsOf(tree))) {
    emit(1, raw);
  }
  emit(0, '</openrocket>');
  return w.lines.join('\n') + '\n';
}

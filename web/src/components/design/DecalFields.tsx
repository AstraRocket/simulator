import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentType, RocketTree } from '../../engine/openRocketEngine';
import { readAppearance, type PartAppearance } from '../../services/design/appearance';
import { DECAL_DEFAULTS, EDGE_MODES, decalPath, type EdgeMode, type PartDecal } from '../../services/design/decal';
import { getDecalImage, MAX_DECAL_BYTES, putDecalImage, sniffImageType } from '../../services/storage/decalStore';
import { walkNodes } from '../../tree/treeWalk';
import { useUnits } from '../../prefs/useUnits';
import { unitScope, degToRad } from '../../prefs/units';
import { roundTo } from '../../services/app/numbers';
import { useWorkspaceStore } from '../../state/store';
import { useFilePick } from '../common/useFilePick';
import { Check } from '../common/Check';
import { NumberInput } from '../common/NumberInput';
import { SelectRow } from '../common/SelectRow';
import { StatusLine } from '../common/StatusLine';
import { UnitChip } from '../common/UnitChip';
import { PanelButton } from './PanelButton';

const NONE = '';

const idOf = (d: PartDecal): string => d.hash ?? `name:${d.name}`;

/** Desktop's `DecalModel` list: every image the design's parts wear, once each. */
function designDecals(tree: RocketTree): PartDecal[] {
  const seen = new Map<string, PartDecal>();
  for (const node of walkNodes(tree.components)) {
    for (const key of ['appearance', 'insideAppearance'] as const) {
      const d = readAppearance(node[key])?.decal;
      if (d && !seen.has(idOf(d))) seen.set(idOf(d), d);
    }
  }
  return [...seen.values()];
}

/** Whether this browser still holds the image; undefined while it looks. */
function useDecalHeld(decal: PartDecal | undefined): boolean | undefined {
  const hash = decal?.hash;
  const [held, setHeld] = useState<{ hash: string; held: boolean } | null>(null);
  useEffect(() => {
    if (!hash) return;
    let live = true;
    void getDecalImage(hash).then((img) => {
      if (live) setHeld({ hash, held: !!img });
    });
    return () => {
      live = false;
    };
  }, [hash]);
  if (!decal) return undefined;
  if (!hash) return false;
  return held?.hash === hash ? held.held : undefined;
}

/** Desktop `AppearancePanel`'s texture rows. */
export function DecalFields({
  type,
  shown,
  disabled,
  onCommit,
}: {
  type: ComponentType;
  shown: PartAppearance;
  disabled: boolean;
  onCommit: (patch: Partial<PartAppearance>) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const tree = useWorkspaceStore((s) => s.tree);
  const options = useMemo(() => designDecals(tree), [tree]);
  const [error, setError] = useState<string | null>(null);
  const decal = shown.decal;
  const held = useDecalHeld(decal);
  const setDecal = (patch: Partial<PartDecal>) => {
    if (decal) onCommit({ decal: { ...decal, ...patch } });
  };
  // Another image keeps the placement, as `AppearanceBuilder.setImage` does.
  const wear = (image: Pick<PartDecal, 'name' | 'hash'>) =>
    onCommit({ decal: { ...DECAL_DEFAULTS, ...decal, name: image.name, hash: image.hash } });

  const upload = async (f: File) => {
    setError(null);
    if (f.size > MAX_DECAL_BYTES) {
      setError(t('prop.decalTooLarge'));
      return;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniffImageType(bytes);
    if (!mime) {
      setError(t('prop.decalUnreadable'));
      return;
    }
    const { hash, saved } = putDecalImage(bytes, mime);
    // The design already names this image: wear it under that name rather than saving a copy.
    const same = options.find((d) => d.hash === hash);
    wear({ name: same?.name ?? decalPath(f.name), hash });
    if (!(await saved)) setError(t('prop.decalNotStored'));
  };
  const file = useFilePick({
    accept: 'image/png,image/jpeg,image/gif,image/bmp,image/webp',
    label: t('prop.decalChoose'),
    onFile: (f) => void upload(f),
  });

  const angle = u.at(unitScope('prop', type, 'decalRotation'), 'angle');
  const axes = (
    label: string,
    value: readonly [number, number],
    write: (v: [number, number]) => void,
    ok = (_: number) => true,
  ) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="flex items-center gap-1">
        {([0, 1] as const).map((i) => (
          <NumberInput
            key={i}
            value={roundTo(value[i], 4)}
            step={0.1}
            disabled={disabled}
            commitOnBlur
            ariaLabel={`${label} ${i === 0 ? 'x' : 'y'}`}
            onChange={(v) => {
              if (v === null || !ok(v) || v === roundTo(value[i], 4)) return;
              const next: [number, number] = [value[0], value[1]];
              next[i] = v;
              write(next);
            }}
            className={FIELD}
          />
        ))}
      </span>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SelectRow
          label={t('prop.decal')}
          value={decal ? idOf(decal) : NONE}
          disabled={disabled}
          width="min-w-0 flex-1"
          className="min-w-0 flex-1"
          onChange={(v) => {
            const d = options.find((o) => idOf(o) === v);
            if (!v) onCommit({ decal: undefined });
            else if (d) wear(d);
          }}
        >
          <option value={NONE}>{t('prop.decalNone')}</option>
          {options.map((d) => (
            <option key={idOf(d)} value={idOf(d)}>
              {d.name.replace(/^decals\//, '')}
            </option>
          ))}
        </SelectRow>
        <PanelButton disabled={disabled} onClick={file.pick} className="h-7 shrink-0">
          {t('prop.decalChoose')}
        </PanelButton>
        {file.input}
      </div>
      <StatusLine tone="warn" size="fine">
        {error ?? (decal && held === false ? t('prop.decalMissing', { name: decal.name }) : null)}
      </StatusLine>
      {decal && (
        <>
          {/* Shown as desktop shows it, the inverse of what is stored (`AppearanceBuilder.getScaleX`). */}
          {axes(
            t('prop.decalScale'),
            [1 / decal.scale[0], 1 / decal.scale[1]],
            (v) => setDecal({ scale: [1 / v[0], 1 / v[1]] }),
            (v) => v !== 0,
          )}
          {axes(t('prop.decalOffset'), decal.offset, (offset) => setDecal({ offset }))}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{t('prop.decalRotation')}</span>
            <span className="flex items-center gap-1">
              <NumberInput
                value={roundTo(angle.toUi(decal.rotation), 3)}
                step={angle.step(degToRad(5))}
                disabled={disabled}
                commitOnBlur
                ariaLabel={t('prop.decalRotation')}
                onChange={(v) => {
                  const si = v === null ? null : angle.toSi(v);
                  if (si !== null && v !== roundTo(angle.toUi(decal.rotation), 3)) setDecal({ rotation: si });
                }}
                className={FIELD}
              />
              <UnitChip
                quantity="angle"
                scope={unitScope('prop', type, 'decalRotation')}
                label={t('prop.decalRotation')}
              />
            </span>
          </div>
          <SelectRow<EdgeMode>
            label={t('prop.decalEdge')}
            value={decal.edgeMode}
            disabled={disabled}
            title={t('prop.decalEdgeHint')}
            onChange={(edgeMode) => setDecal({ edgeMode })}
          >
            {EDGE_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`prop.decalEdge_${m}`)}
              </option>
            ))}
          </SelectRow>
          <Check
            checked={shown.opacityAffectsTexture === true}
            disabled={disabled}
            onChange={(v) => onCommit({ opacityAffectsTexture: v || undefined })}
            label={t('prop.opacityAffectsTexture')}
            hint={t('prop.opacityAffectsTextureHint')}
            className="text-xs text-ink-muted"
            align="start"
          />
        </>
      )}
    </>
  );
}

const FIELD =
  'w-16 rounded-md bg-raised px-2 py-1 text-right text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-muted';

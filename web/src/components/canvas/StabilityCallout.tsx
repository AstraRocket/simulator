import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type * as THREE from 'three';
import type { StaticInfo } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { AxisCallout } from './rocketCallouts';
import { marginText } from '../../tree/schematicGeometry';
import { CP_INK, MARGIN_INK } from './stabilityInks';
import { useSceneColors } from './sceneColors';

// The caller renders it only when `info.cp` is finite.
export function StabilityCallout({
  info,
  maxR,
  markerR,
  tex,
}: {
  info: StaticInfo;
  maxR: number;
  markerR: number;
  tex: THREE.Texture;
}) {
  const scene = useSceneColors();
  const { t } = useTranslation();
  const u = useUnits();
  const cal = info.stabilityCalibers;
  const cpCallout = useMemo(() => {
    if (!Number.isFinite(info.cp)) return null;
    const margin = marginText(cal, info.stabilityPercent, t);
    if (!margin) return null;
    return {
      text: `${t('schematic.cp')} · ${u.fmtSym('length', info.cp)}    ${margin.text}`,
      color: scene[MARGIN_INK[margin.state]],
    };
  }, [info, cal, t, u, scene]);
  return (
    <AxisCallout
      x={info.cp}
      dir={-1}
      color={scene[CP_INK]}
      tex={tex}
      label={cpCallout?.text}
      labelColor={cpCallout?.color}
      place="right"
      len={maxR * 1.7}
      markerR={markerR}
      dashSize={maxR * 0.15}
      gapSize={maxR * 0.1}
    />
  );
}

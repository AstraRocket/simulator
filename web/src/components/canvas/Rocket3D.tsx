import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds } from '@react-three/drei';
import type { RocketTree, StaticInfo } from '../../engine/openRocketEngine';
import { type ExportData } from '../../services/exports/schematicExport.js';
import { mergePalette } from '../../services/design/partColors';
import { useSettings } from '../../state/SettingsProvider';
import { ImageExportMenu } from './ImageExportMenu.js';
import { useUnits } from '../../prefs/useUnits';
import type { MotorDims } from '../../tree/schematicGeometry';
import { markerRadius, type RenderMode } from './rocketPieces';
import { rocketSvg } from './rocketSvgExport';
import { exportView } from './rocketExportCamera';
import { usePieces } from './usePieces';
import { AxisCallout, markerTexture } from './rocketCallouts';
import { StabilityCallout } from './StabilityCallout';
import { RocketModel } from './RocketModel';
import { useRocketExport, type R3fHandles } from './useRocketExport';
import { CG_INK, CP_INK } from './stabilityInks';
import { token } from '../common/colorTokens';
import { useSceneColors } from './sceneColors';
import { errorText } from '../../i18n/keyedError';
import { ToolDivider, ViewBtn } from './ViewBtn';
import { Segmented } from '../common/Segmented';
import { SvgExportButton } from './SvgExportButton';
import { RoomReflections } from './RoomReflections';
import { keyLight, LightBall, MovableKeyLight, ViewLight } from './MovableKeyLight';

const CAMERA_VIEWS = ['side', 'aft'] as const;

// Rocket axis is +X: nose tip at x=0, aft increasing, as in the engine.
export function Rocket3D({
  tree,
  info,
  motors,
  exportData,
  selectedId,
  onSelect,
  showMarkers = true,
  onError,
  ctrlSlot,
  presetSlot,
}: {
  tree: RocketTree;
  info: StaticInfo | null;
  showMarkers?: boolean;
  motors?: MotorDims;
  exportData?: ExportData;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onError?: (message: string) => void;
  ctrlSlot?: HTMLElement | null;
  presetSlot?: HTMLElement | null;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const palette = useMemo(() => mergePalette(settings.partColors), [settings.partColors]);
  const { pieces, totalLen, maxR } = usePieces(tree, motors, palette);
  const r3f = useRef<R3fHandles | null>(null);

  const snapshot = useRocketExport(r3f, pieces, exportData, (e) =>
    onError?.(t('export.imageFailed', { message: errorText(e, t) })),
  );
  const svgSnapshot = (data: ExportData) => {
    const st = r3f.current;
    if (!st) return null;
    const el = st.gl.domElement;
    const aspect = (el.clientWidth || el.width || 1) / (el.clientHeight || el.height || 1);
    return rocketSvg(st.scene, exportView(st.camera, pieces, true, aspect), aspect, data);
  };
  const center = totalLen / 2;
  const camDist = Math.max(totalLen * 1.1, maxR * 6, 0.25);
  const markerR = markerRadius(totalLen, maxR);
  const scene = useSceneColors();
  const light = scene['scene-callout-light'];
  const cgTex = useMemo(() => markerTexture(scene[CG_INK], light), [scene, light]);
  const cpTex = useMemo(() => markerTexture(scene[CP_INK], light), [scene, light]);
  useEffect(
    () => () => {
      cgTex.dispose();
      cpTex.dispose();
    },
    [cgTex, cpTex],
  );

  const controls = useRef<import('three-stdlib').OrbitControls | null>(null);
  const [preset, setPreset] = useState<'side' | 'aft'>('side');
  // Per-material clipping, not renderer.clippingPlanes, because only the airframe is cut.
  const [cutaway, setCutaway] = useState(false);
  // Desktop opens on Figure.
  const [mode, setMode] = useState<RenderMode>('figure');
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), []);
  const sidePos: [number, number, number] = [center, 0, camDist * 1.05];
  const aftPos: [number, number, number] = [totalLen + camDist * 0.9, 0, 0];
  const moveCam = (pos: [number, number, number]) => {
    const st = r3f.current;
    const c = controls.current;
    if (!st || !c) return;
    st.camera.position.set(pos[0], pos[1], pos[2]);
    c.target.set(center, 0, 0);
    c.update();
  };
  const showView = (which: 'side' | 'aft') => {
    setPreset(which);
    moveCam(which === 'side' ? sidePos : aftPos);
  };
  const [lamp] = useState(keyLight);
  const resetView = () => {
    lamp.reset();
    moveCam(preset === 'side' ? sidePos : aftPos);
  };

  const presets = (
    <>
      <ViewBtn onClick={resetView} title={t('view.reset3dTitle')}>
        {t('view.reset')}
      </ViewBtn>
      <Segmented
        size="bar"
        options={CAMERA_VIEWS}
        value={preset}
        onChange={showView}
        fmt={(v) => t(`view.${v}`)}
        title={(v) => t(`view.${v}Title`)}
      />
      <ToolDivider />
    </>
  );
  const tools = (
    <>
      <ViewBtn active={cutaway} onClick={() => setCutaway((c) => !c)} title={t('view.cutawayTitle')}>
        {t('view.cutaway')}
      </ViewBtn>
      <Segmented
        size="bar"
        options={['figure', 'finished'] as const}
        value={mode}
        onChange={setMode}
        fmt={(m) => t(m === 'figure' ? 'view.figure' : 'view.finished')}
        title={(m) => t(m === 'figure' ? 'view.figureTitle' : 'view.finishedTitle')}
      />
      {exportData && (
        <SvgExportButton
          title={t('export.svgTitle3d')}
          name={exportData.name}
          view="3d"
          build={() => svgSnapshot(exportData)}
          onError={onError}
        />
      )}
      {exportData && (
        <ImageExportMenu
          icon="📷"
          label={t('export.image')}
          fitOption
          title={t('export.imageTitle3d')}
          onPick={snapshot}
        />
      )}
    </>
  );

  return (
    <div
      className="rocket3d-wrap"
      style={{ position: 'relative', height: '100%', minHeight: 320, display: 'flex', flexDirection: 'column' }}
    >
      {presetSlot && ctrlSlot ? (
        <>
          {createPortal(presets, presetSlot)}
          {createPortal(tools, ctrlSlot)}
        </>
      ) : (
        <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, display: 'flex', gap: 6 }}>
          {presets}
          {tools}
        </div>
      )}
      <Canvas
        // A rotated portrait pane swaps getBoundingClientRect's width and height; offsetWidth ignores transforms.
        resize={{ offsetSize: true }}
        style={{ flex: '1 1 0%', minHeight: 0 }}
        camera={{ position: [center, 0, camDist * 1.05], fov: 40 }}
        // preserveDrawingBuffer, or the export's live-canvas fallback reads black. ACES turns saturated blue purple.
        gl={{ preserveDrawingBuffer: true, localClippingEnabled: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={(state) => {
          r3f.current = { gl: state.gl, scene: state.scene, camera: state.camera, setFrameloop: state.setFrameloop };
        }}
      >
        <ambientLight intensity={0.55} />
        <MovableKeyLight light={lamp} intensity={0.95} color={scene['scene-light-key']} />
        <ViewLight from={[-2, 0.5, -1]} intensity={0.45} color={scene['scene-light-fill']} />
        <ViewLight from={[-0.5, -1.5, -2.5]} intensity={0.35} />
        <Bounds fit clip observe margin={1.1}>
          <group>
            <RoomReflections>
              <RocketModel
                pieces={pieces}
                selectedId={selectedId}
                onSelect={onSelect}
                clip={cutaway ? clipPlane : null}
                mode={mode}
              />
            </RoomReflections>
            {/* CG/CP sit inside the shell: depthTest off, and `transparent` queues them after the see-through shell. */}
            {showMarkers && info && Number.isFinite(info.cg) && (
              <AxisCallout
                x={info.cg}
                dir={1}
                color={scene['scene-callout']}
                tex={cgTex}
                label={`${t('schematic.cg')} · ${u.fmtSym('length', info.cg)}`}
                len={maxR * 1.7}
                markerR={markerR}
              />
            )}
            {showMarkers && info && Number.isFinite(info.cp) && (
              <StabilityCallout info={info} maxR={maxR} markerR={markerR} tex={cpTex} />
            )}
          </group>
        </Bounds>
        <OrbitControls
          makeDefault
          ref={controls}
          target={[center, 0, 0]}
          enableDamping
          dampingFactor={0.1}
          // Right button is left free for MovableKeyLight.
          mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY }}
          minDistance={camDist * 0.12}
          maxDistance={camDist * 5}
        />
      </Canvas>
      <LightBall light={lamp} className="absolute bottom-7 right-2" />
      <p style={{ fontSize: 11, color: token('ink-muted'), margin: '4px 0 0', textAlign: 'center' }}>
        {t('view.dragHint')}
        {showMarkers && (
          <>
            {' · '}
            <span aria-hidden="true" style={{ color: token(CG_INK) }}>
              ●
            </span>{' '}
            {t('schematic.cg')} ·{' '}
            <span aria-hidden="true" style={{ color: token(CP_INK) }}>
              ●
            </span>{' '}
            {t('schematic.cp')}
          </>
        )}
      </p>
    </div>
  );
}

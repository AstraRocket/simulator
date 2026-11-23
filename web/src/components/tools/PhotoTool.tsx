import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import {
  BACKGROUND_TYPES,
  PHOTO_DEFAULTS,
  SKIES,
  reducePi,
  settled,
  type PhotoSettings,
  type SkyId,
} from '../../services/design/photoSettings';
import { selectConfig, selectDesignName, useWorkspaceStore } from '../../state/store';
import { selectMotorDims } from '../../state/configSlice';
import { usePartPalette } from '../common/usePartPalette';
import { usePieces } from '../canvas/usePieces';
import { piecesBounds, type Piece } from '../canvas/rocketPieces';
import { decalsFor, type DecalTextures } from '../canvas/finishedScene';
import { photoSky } from '../canvas/photo/photoSkies';
import {
  disposePhotoRenderer,
  drawPhoto,
  photoCamera,
  sunDirection,
  type PhotoInput,
} from '../canvas/photo/photoRender';
import { LightBallView } from '../canvas/MovableKeyLight';
import { activeCustomTexture, customBackground, subscribeCustomBackground } from '../canvas/photo/customBackground';
import { onDecalImage } from '../../services/storage/decalStore';
import { photoPrefs, setPhotoPrefs, subscribePhotoPrefs } from '../../services/storage/photoPrefs';
import { saveBlob, exportFilename } from '../../services/files/saveFile';
import { encodeCanvas } from '../../services/exports/schematicExport';
import { Segmented } from '../common/Segmented';
import { PanelButton } from '../design/PanelButton';
import { StatusLine } from '../common/StatusLine';
import { PhotoFields } from './PhotoFields';
import { useElementResize } from '../common/useElementResize';

const TABS = ['orientation', 'environment', 'effects'] as const;
type Tab = (typeof TABS)[number];

/** Radians per pixel of drag, as the design view turns. */
const DRAG_TURN = 0.01;
/** Twice the preview, as large as the GPU allows. */
const EXPORT_SCALE = 2;

/** Desktop's Photo Studio: the finished rocket posed against a sky, with its flame and smoke, saved as a picture. */
export function PhotoTool() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const config = useWorkspaceStore(selectConfig);
  const palette = usePartPalette();
  const motors = useMemo(() => selectMotorDims(tree, config), [tree, config]);
  const hasMotors = Object.keys(motors).length > 0;
  const { pieces } = usePieces(tree, motors, palette);

  // A drag or a slider moves a draft; letting go saves it in the browser.
  const saved = useSyncExternalStore(subscribePhotoPrefs, photoPrefs);
  const [draft, setDraftState] = useState<PhotoSettings | null>(null);
  // Events can outrun renders, so each change builds on the newest draft, not the one last drawn.
  const draftRef = useRef<PhotoSettings | null>(null);
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  const setDraft = (d: PhotoSettings | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const s = draft ?? saved;
  const edit = (patch: Partial<PhotoSettings> | ((cur: PhotoSettings) => Partial<PhotoSettings>), final = true) => {
    const cur = draftRef.current ?? savedRef.current;
    const next = settled({ ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) });
    if (!final) {
      setDraft(next);
      return;
    }
    setDraft(null);
    setPhotoPrefs(next);
  };
  const commitDraft = () => {
    if (draftRef.current) edit({}, true);
  };
  const commitRef = useRef(commitDraft);
  useEffect(() => {
    commitRef.current = commitDraft;
  });

  const [tab, setTab] = useState<Tab>('orientation');
  const [status, setStatus] = useState<string | null>(null);

  const sky = useSky(s.backgroundType === 'TEXTURE' ? s.sky : null, setStatus, t('photo.skyFailed'));
  const decals = useDecals(pieces);

  const view = useRef<HTMLCanvasElement>(null);
  const renderer = useRenderer();
  const size = useCanvasSize(view);
  const custom = activeCustomTexture(useSyncExternalStore(subscribeCustomBackground, customBackground));
  const input: PhotoInput = { pieces, settings: s, hasMotors, sky, decals, custom };
  const noGl = t('photo.noWebgl');
  // One draw per frame however fast the settings change.
  useEffect(() => {
    const canvas = view.current;
    if (!canvas || !size) return;
    const frame = requestAnimationFrame(() => {
      const r = renderer();
      if (!r) {
        setStatus(noGl);
        return;
      }
      canvas.width = size.w;
      canvas.height = size.h;
      drawPhoto(r, { pieces, settings: s, hasMotors, sky, decals, custom }, canvas);
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, size, pieces, s, hasMotors, sky, decals, custom, noGl]);

  // Left drag turns the camera, right drag or Alt-drag the sun, the wheel moves the camera in and out.
  const drag = useRef<{ x: number; y: number; light: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    drag.current = { x: e.clientX, y: e.clientY, light: e.button === 2 || e.altKey };
    setLightDragging(drag.current.light);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * DRAG_TURN;
    const dy = (e.clientY - d.y) * DRAG_TURN;
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    if (d.light) {
      edit(
        (c) => ({
          lightAz: reducePi(c.lightAz + dx),
          lightAlt: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, c.lightAlt - dy)),
        }),
        false,
      );
    } else edit((c) => ({ viewAz: c.viewAz + dx, viewAlt: c.viewAlt + dy }), false);
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setLightDragging(false);
    commitDraft();
  };
  // The design view's light ball: the sun as the camera sees it, shown while it is dragged.
  const [lightDragging, setLightDragging] = useState(false);
  const sunView = useMemo(() => {
    const toView = photoCamera(s, 1, 1).quaternion.invert();
    const d = sunDirection(s).applyQuaternion(toView).normalize();
    return { x: d.x, y: d.y, z: d.z, dragging: lightDragging };
  }, [s, lightDragging]);
  const editRef = useRef(edit);
  useEffect(() => {
    editRef.current = edit;
  });
  useEffect(() => {
    const canvas = view.current;
    if (!canvas) return;
    let rest: ReturnType<typeof setTimeout> | undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = Math.exp(Math.sign(e.deltaY) * 0.1);
      editRef.current((c) => ({ viewDistance: c.viewDistance * k }), false);
      clearTimeout(rest);
      // Written once the wheel rests, not per notch.
      rest = setTimeout(() => commitRef.current(), 300);
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', wheel);
      clearTimeout(rest);
    };
  }, []);

  const { saveImage, copyImage, canCopy } = usePhotoExport(() => {
    const r = renderer();
    return r && size ? { r, size, input } : null;
  }, setStatus);

  const credit = s.backgroundType === 'TEXTURE' && !custom ? SKIES.find((k) => k.id === s.sky)?.credit : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex min-h-[260px] flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <canvas
            ref={view}
            aria-label={t('photo.previewLabel')}
            // A checkerboard shows through a see-through background, as an image editor shows one.
            className="absolute inset-0 h-full w-full cursor-grab touch-none bg-[repeating-conic-gradient(rgb(128_128_128/0.27)_0_25%,transparent_0_50%)] bg-[length:16px_16px] active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          <LightBallView view={sunView} className="absolute bottom-2 right-2" />
        </div>
        <p className="px-2 py-1 text-center text-[11px] text-ink-muted">
          {t('photo.dragHint')}
          {credit ? ` · ${t('photo.skyCredit')}: ${credit}` : ''}
        </p>
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-3 overflow-auto border-t border-line/10 p-3 lg:w-80 lg:border-l lg:border-t-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-ink">{t('tools.tool_photo')}</h2>
          <PanelButton onClick={() => void saveImage()}>{t('photo.saveImage')}</PanelButton>
          {canCopy && <PanelButton onClick={() => void copyImage()}>{t('photo.copyImage')}</PanelButton>}
          <PanelButton onClick={() => edit(PHOTO_DEFAULTS)} title={t('photo.resetHint')}>
            {t('photo.reset')}
          </PanelButton>
        </div>
        <StatusLine tone="warn" size="fine">
          {status}
        </StatusLine>
        <Segmented options={TABS} value={tab} onChange={setTab} fmt={(v) => t(`photo.tab_${v}`)} />
        <PhotoFields
          tab={tab}
          s={s}
          edit={edit}
          hasMotors={hasMotors}
          span={rocketSpan(pieces)}
          backgrounds={BACKGROUND_TYPES}
          skies={SKIES.map<SkyId>((k) => k.id)}
        />
      </aside>
    </div>
  );
}

function rocketSpan(pieces: readonly Piece[]): number {
  const box = piecesBounds([...pieces]);
  return box.isEmpty() ? 0.3 : Math.max(box.max.x - box.min.x, 0.05);
}

/** Made on first use and kept until the tool closes; null where the browser has no WebGL. */
function useRenderer(): () => THREE.WebGLRenderer | null {
  const ref = useRef<THREE.WebGLRenderer | null | undefined>(undefined);
  useEffect(
    () => () => {
      const r = ref.current;
      ref.current = undefined;
      if (!r) return;
      disposePhotoRenderer(r);
      r.forceContextLoss();
    },
    [],
  );
  return useCallback(() => {
    if (ref.current !== undefined) return ref.current;
    try {
      ref.current =
        typeof WebGLRenderingContext === 'undefined'
          ? null
          : new THREE.WebGLRenderer({
              canvas: document.createElement('canvas'),
              alpha: true,
              antialias: true,
              preserveDrawingBuffer: true,
            });
    } catch {
      ref.current = null;
    }
    return ref.current;
  }, []);
}

interface ExportSource {
  r: THREE.WebGLRenderer;
  size: { w: number; h: number };
  input: PhotoInput;
}

/** Save and copy: the picture at twice the preview, as large as the GPU allows, as a PNG. */
function usePhotoExport(source: () => ExportSource | null, setStatus: (s: string | null) => void) {
  const { t } = useTranslation();
  const designName = useWorkspaceStore(selectDesignName);
  const imagePng = async (): Promise<Blob | null> => {
    const src = source();
    if (!src) return null;
    const { r, size } = src;
    const max = r.capabilities.maxTextureSize;
    const k = Math.min(EXPORT_SCALE, max / size.w, max / size.h);
    const out = document.createElement('canvas');
    out.width = Math.round(size.w * k);
    out.height = Math.round(size.h * k);
    drawPhoto(r, src.input, out);
    return await encodeCanvas(out, 'png');
  };
  const saveImage = async () => {
    setStatus(null);
    try {
      const blob = await imagePng();
      if (blob) await saveBlob(blob, exportFilename([designName, 'photo'], 'png'));
    } catch {
      setStatus(t('photo.saveFailed'));
    }
  };
  // Desktop's Edit ▸ Copy. Browsers take only PNG on the clipboard; some take none at all.
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
  const copyImage = async () => {
    setStatus(null);
    try {
      const blob = await imagePng();
      if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      setStatus(t('photo.copyFailed'));
    }
  };
  return { saveImage, copyImage, canCopy };
}

/** In device pixels, capped at 2x; null until the canvas has been laid out. */
function useCanvasSize(ref: React.RefObject<HTMLCanvasElement | null>): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useElementResize(ref, (rect) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    setSize((old) => (old && old.w === w && old.h === h ? old : { w, h }));
  });
  return size;
}

function useSky(id: SkyId | null, onError: (m: string) => void, message: string): THREE.Texture | null {
  const [sky, setSky] = useState<{ id: SkyId; t: THREE.Texture } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    photoSky(id).then(
      (t) => {
        if (live) setSky({ id, t });
      },
      () => {
        if (live) onError(message);
      },
    );
    return () => {
      live = false;
    };
  }, [id, onError, message]);
  return sky && sky.id === id ? sky.t : null;
}

function useDecals(pieces: readonly Piece[]): DecalTextures {
  const [decals, setDecals] = useState<DecalTextures>(() => new Map());
  const [arrived, setArrived] = useState(0);
  useEffect(() => onDecalImage(() => setArrived((n) => n + 1)), []);
  useEffect(() => {
    let live = true;
    const made: THREE.Texture[] = [];
    void decalsFor(pieces, made).then((d) => {
      if (live) setDecals(d);
      else for (const tex of made) tex.dispose();
    });
    return () => {
      live = false;
      for (const tex of made) tex.dispose();
    };
  }, [pieces, arrived]);
  return decals;
}

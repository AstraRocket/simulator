import type { RefObject } from 'react';
import * as THREE from 'three';
import {
  IMAGE_FORMAT_EXT,
  snapshotWithHeader,
  type ExportData,
  type ImageFormat,
} from '../../services/exports/schematicExport.js';
import { download, exportFilename } from '../../services/files/saveFile';
import type { ImageExportOptions } from './ImageExportMenu.js';
import { type Piece } from './rocketPieces';
import { exportView } from './rocketExportCamera';
import { captureSceneOffscreen } from './offscreenCapture';
import { clampExportSize } from '../../services/exports/offscreenRaster';
import { useLatest } from '../common/useLatest';
import { KeyedError } from '../../i18n/keyedError';

export interface R3fHandles {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  setFrameloop: (mode: 'always' | 'demand' | 'never') => void;
}

export function useRocketExport(
  r3f: RefObject<R3fHandles | null>,
  pieces: Piece[],
  exportData: ExportData | undefined,
  onError?: (err: unknown) => void,
): (format: ImageFormat, widthPx: number, opts?: ImageExportOptions) => Promise<void> {
  // Observed, never claimed: a second export does not cancel the first one's restore.
  const { observe } = useLatest();

  const run = async (format: ImageFormat, widthPx: number, opts?: ImageExportOptions) => {
    const st = r3f.current;
    if (!st || !exportData) return;
    const el = st.gl.domElement;
    const cssW = el.clientWidth || el.width || 1;
    const cssH = el.clientHeight || el.height || 1;
    const { width, height } = clampExportSize(widthPx, cssW / cssH, st.gl.capabilities.maxTextureSize);

    // A throwaway camera: OrbitControls owns the live one, and mutating it would desync the view.
    const cam = exportView(st.camera, pieces, !!opts?.fit, width / height);
    const filename = exportFilename([exportData.name, '3d'], IMAGE_FORMAT_EXT[format]);

    let offscreen: HTMLCanvasElement | null = null;
    try {
      offscreen = captureSceneOffscreen(st.gl, st.scene, cam, width, height);
    } catch (err) {
      // Past the browser's canvas area limit; the live path would fail too.
      if (err instanceof KeyedError) throw err;
      console.warn('3D export: offscreen capture failed, falling back to the live canvas', err);
    }
    if (offscreen) {
      download(filename, await snapshotWithHeader(offscreen, exportData, format));
      return;
    }

    const pr = st.gl.getPixelRatio();
    const live = observe();
    try {
      // Freeze the frame loop so no on-screen frame lands between our render and the readback.
      st.setFrameloop('never');
      st.gl.setPixelRatio(1);
      st.gl.setSize(width, height, false);
      st.gl.render(st.scene, cam);
      download(filename, await snapshotWithHeader(el, exportData, format));
    } finally {
      // Restoring a disposed renderer throws out of `finally` and loses the export error.
      if (live() && r3f.current === st) {
        st.gl.setPixelRatio(pr);
        st.gl.setSize(cssW, cssH, false);
        st.gl.render(st.scene, st.camera);
        st.setFrameloop('always');
      }
    }
  };

  return async (format: ImageFormat, widthPx: number, opts?: ImageExportOptions) => {
    try {
      await run(format, widthPx, opts);
    } catch (err) {
      onError?.(err);
    }
  };
}

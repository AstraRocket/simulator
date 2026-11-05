import { useEffect, useRef, useState, type RefObject } from 'react';
import { MIN_ZOOM, SITE_ZOOM, roundCoord, unproject, panView } from '../../services/map/slippyMap';
import { useElementResize } from '../common/useElementResize';
import { useNativeWheel } from '../common/useNativeWheel';

const CLICK_SLOP_PX = 4;

const KEY_PAN_PX = 80;

export interface View {
  lat: number;
  lon: number;
  zoom: number;
}

/** The map's center and zoom, and the pointer, key and wheel gestures that move them. */
export function useSiteMapView({
  hostRef,
  latitudeDeg,
  longitudeDeg,
  onPick,
  maxZoom,
  live,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  onPick?: (latitudeDeg: number, longitudeDeg: number) => void;
  maxZoom: number;
  live: boolean;
}) {
  const [size, setSize] = useState({ w: 320, h: 256 });
  const [view, setView] = useState<View>({
    lat: latitudeDeg ?? 0,
    lon: longitudeDeg ?? 0,
    zoom: latitudeDeg === null || longitudeDeg === null ? 2 : SITE_ZOOM,
  });

  useElementResize(hostRef, (r) => {
    if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
  });

  // Recenter on outside changes only; following our own click would snap the view from the pointer.
  const emitted = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (latitudeDeg === null || longitudeDeg === null) return;
    const mine = emitted.current;
    if (mine && Math.abs(mine.lat - latitudeDeg) < 1e-9 && Math.abs(mine.lon - longitudeDeg) < 1e-9) return;
    setView((v) => ({
      lat: latitudeDeg,
      lon: longitudeDeg,
      zoom: v.zoom < SITE_ZOOM - 3 ? SITE_ZOOM : v.zoom,
    }));
  }, [latitudeDeg, longitudeDeg]);

  const setZoom = (next: number, about?: { x: number; y: number }) => {
    const z = Math.max(MIN_ZOOM, Math.min(maxZoom, next));
    if (z === view.zoom) return;
    if (!about) return setView((v) => ({ ...v, zoom: z }));
    const at = unproject(about.x, about.y, view.lat, view.lon, view.zoom, size.w, size.h);
    setView(
      panView({ lat: at.latitudeDeg, lon: at.longitudeDeg, zoom: z }, size.w / 2 - about.x, size.h / 2 - about.y),
    );
  };

  const drag = useRef<{ id: number; x: number; y: number; view: View; moved: number } | null>(null);
  // A second finger ends the gesture, so the last finger lifting is not a tap.
  const down = useRef(new Set<number>());
  const release = (e: React.PointerEvent) => {
    down.current.delete(e.pointerId);
  };

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = hostRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!live) return;
    // Button clicks bubble here; leaving `drag` unset makes `onPointerUp` bail.
    if ((e.target as Element).closest?.('button')) return;
    // Captured on the box, not `e.target`: a tile unmounts mid-drag and drops the capture.
    down.current.add(e.pointerId);
    if (down.current.size > 1) {
      drag.current = null;
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view, moved: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
    if (d.moved < CLICK_SLOP_PX) return;
    // The ground follows the pointer, so the center moves the other way.
    setView(panView(d.view, -dx, -dy));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (pan) {
      e.preventDefault();
      setView(panView(view, pan[0]! * KEY_PAN_PX, pan[1]! * KEY_PAN_PX));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      setZoom(view.zoom + 1);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      setZoom(view.zoom - 1);
    } else if ((e.key === 'Enter' || e.key === ' ') && onPick) {
      e.preventDefault();
      const lat = roundCoord(view.lat);
      const lon = roundCoord(view.lon);
      emitted.current = { lat, lon };
      onPick(lat, lon);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    release(e);
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    if (d.moved >= CLICK_SLOP_PX || !onPick) return;
    const p = localPoint(e);
    const at = unproject(p.x, p.y, view.lat, view.lon, view.zoom, size.w, size.h);
    const lat = roundCoord(at.latitudeDeg);
    const lon = roundCoord(at.longitudeDeg);
    emitted.current = { lat, lon };
    onPick(lat, lon);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    release(e);
    drag.current = null;
  };

  // Native non-passive listener: React's `onWheel` is passive, so `preventDefault` would not work.
  useNativeWheel(
    hostRef,
    (e) => {
      e.preventDefault();
      setZoom(view.zoom + (e.deltaY < 0 ? 1 : -1), localPoint(e));
    },
    live,
  );

  return { size, view, setView, setZoom, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown };
}

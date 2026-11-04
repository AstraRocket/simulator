// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { SiteMap } from '../../../src/components/sim/SiteMap';
import { renderWithProviders, seedSettings } from '../../testing/renderWithProviders';

// jsdom has no ResizeObserver, so the box keeps its 320x256 default with center (160, 128).

const HOME = { latitudeDeg: 39.05, longitudeDeg: -104.8 };

const tiles = () => Array.from(document.querySelectorAll('img')).map((el) => el.getAttribute('src') ?? '');

describe('SiteMap', () => {
  it('asks its default source for tiles around the coordinate', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    const sources = tiles();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.includes('World_Imagery/MapServer/tile/15/'))).toBe(true);
  });

  it('switches to the street layer, on the same provider', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    fireEvent.click(screen.getByRole('button', { name: 'Street' }));
    const sources = tiles();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.includes('World_Street_Map/MapServer/tile/15/'))).toBe(true);
    expect(sources.some((s) => s.includes('openstreetmap.org'))).toBe(false);

    // The layer choice is module-scoped; restore it for later tests.
    fireEvent.click(screen.getByRole('button', { name: 'Satellite' }));
    expect(tiles().every((s) => s.includes('World_Imagery'))).toBe(true);
  });

  it('reads the coordinate back with hemispheres rather than signs', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    expect(screen.getByText('39.0500° N, 104.8000° W')).toBeTruthy();
  });

  it('keeps touch drags for itself', () => {
    renderWithProviders(<SiteMap {...HOME} onPick={vi.fn()} />);
    expect(screen.getByRole('group', { name: /Launch site map/ }).className).toContain('touch-none');
  });

  it('does not move the location when a second finger lands and lifts', () => {
    const onPick = vi.fn();
    renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
    const map = screen.getByRole('group', { name: /Launch site map/ });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 160, clientY: 128 });
    fireEvent.pointerDown(map, { pointerId: 2, clientX: 200, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 2, clientX: 200, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 160, clientY: 128 });
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.pointerDown(map, { pointerId: 3, clientX: 160, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 3, clientX: 160, clientY: 128 });
    expect(onPick).toHaveBeenCalledWith(39.05, -104.8);
  });

  it('says what to do when there is no coordinate yet', () => {
    renderWithProviders(<SiteMap latitudeDeg={null} longitudeDeg={null} />);
    expect(screen.getByText(/Enter a latitude and longitude/i)).toBeTruthy();
  });

  it('picks the coordinate under a click', () => {
    const onPick = vi.fn();
    renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
    const map = screen.getByRole('group', { name: /Launch site map/ });

    fireEvent.pointerDown(map, { pointerId: 1, clientX: 160, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 160, clientY: 128 });
    expect(onPick).toHaveBeenCalledWith(39.05, -104.8);
  });

  it('picks north-west of center for a click above and left of it', () => {
    const onPick = vi.fn();
    renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
    const map = screen.getByRole('group', { name: /Launch site map/ });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 100, clientY: 60 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 100, clientY: 60 });

    const [lat, lon] = onPick.mock.calls[0]!;
    expect(lat).toBeGreaterThan(HOME.latitudeDeg);
    expect(lon).toBeLessThan(HOME.longitudeDeg);
  });

  it('pans on a drag instead of picking', () => {
    const onPick = vi.fn();
    renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
    const map = screen.getByRole('group', { name: /Launch site map/ });

    fireEvent.pointerDown(map, { pointerId: 1, clientX: 160, clientY: 128 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 210, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 210, clientY: 128 });
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('39.0500° N, 104.8000° W')).toBeTruthy();
  });

  it('does not move the location when a control inside the map is clicked', () => {
    const onPick = vi.fn();
    renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
    for (const name of ['Street', 'Satellite', 'Zoom in', 'Zoom out']) {
      const button = screen.getByRole('button', { name });
      fireEvent.pointerDown(button, { pointerId: 1, clientX: 20, clientY: 12 });
      fireEvent.pointerUp(button, { pointerId: 1, clientX: 20, clientY: 12 });
    }
    expect(onPick).not.toHaveBeenCalled();
  });

  describe('from the keyboard', () => {
    const map = () => screen.getByRole('group', { name: /Launch site map/ });

    it('is a tab stop, and says which keys do what', () => {
      renderWithProviders(<SiteMap {...HOME} onPick={vi.fn()} />);
      expect(map().tabIndex).toBe(0);
      const hint = document.getElementById(map().getAttribute('aria-describedby')!);
      expect(hint?.textContent).toMatch(/Enter puts the location at the center/);
    });

    it('puts the location at the center on Enter, after panning with the arrows', () => {
      const onPick = vi.fn();
      renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
      fireEvent.keyDown(map(), { key: 'Enter' });
      expect(onPick).toHaveBeenLastCalledWith(39.05, -104.8);
      fireEvent.keyDown(map(), { key: 'ArrowRight' });
      fireEvent.keyDown(map(), { key: 'ArrowUp' });
      fireEvent.keyDown(map(), { key: ' ' });
      const [lat, lon] = onPick.mock.calls.at(-1)! as [number, number];
      expect(lat).toBeGreaterThan(39.05);
      expect(lon).toBeGreaterThan(-104.8);
    });

    it('zooms with plus and minus', () => {
      renderWithProviders(<SiteMap {...HOME} />);
      fireEvent.keyDown(map(), { key: '+' });
      expect(tiles().every((s) => s.includes('/tile/16/'))).toBe(true);
      fireEvent.keyDown(map(), { key: '-' });
      fireEvent.keyDown(map(), { key: '-' });
      expect(tiles().every((s) => s.includes('/tile/14/'))).toBe(true);
    });

    it('only shows and pans when it is not a picker: Enter does nothing', () => {
      renderWithProviders(<SiteMap {...HOME} />);
      expect(document.getElementById(map().getAttribute('aria-describedby')!)?.textContent).not.toMatch(/Enter/);
      fireEvent.keyDown(map(), { key: 'Enter' });
      expect(screen.getByText('39.0500° N, 104.8000° W')).toBeTruthy();
    });

    it('leaves keys aimed at a button inside the map to that button', () => {
      const onPick = vi.fn();
      renderWithProviders(<SiteMap {...HOME} onPick={onPick} />);
      fireEvent.keyDown(screen.getByRole('button', { name: 'Zoom in' }), { key: 'Enter' });
      expect(onPick).not.toHaveBeenCalled();
    });
  });

  it('omits the click-to-move hint when it is only showing', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    expect(screen.queryByText(/Click the map/i)).toBeNull();
  });

  it('falls back to a coordinate grid when the tiles cannot load', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs.length).toBeGreaterThanOrEqual(3);

    fireEvent.error(imgs[0]!);
    expect(document.querySelectorAll('img').length).toBeGreaterThan(0);
    fireEvent.error(imgs[1]!);
    fireEvent.error(imgs[2]!);

    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByText(/No imagery offline/i)).toBeTruthy();
    expect(screen.getByText('39.0500° N, 104.8000° W')).toBeTruthy();
  });

  it('keeps drawing once a tile has loaded, however many others fail', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    const imgs = Array.from(document.querySelectorAll('img'));
    fireEvent.load(imgs[0]!);
    for (const img of imgs.slice(1)) fireEvent.error(img);
    expect(document.querySelectorAll('img').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No imagery offline/i)).toBeNull();
  });
});

describe('SiteMap scale', () => {
  const scale = () => screen.getByText(/^[\d.,]+ (m|km|ft|mi)$/).textContent;

  it('reads in meters by default', () => {
    renderWithProviders(<SiteMap {...HOME} />);
    expect(scale()).toMatch(/ m$/);
  });

  it('reads in feet, then miles, when the distance unit is feet', () => {
    seedSettings({ units: { distance: 'ft' } });
    renderWithProviders(<SiteMap {...HOME} />);
    expect(scale()).toMatch(/ ft$/);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(scale()).toMatch(/ mi$/);
  });
});

// React's `onWheel` is passive at the root, so only a native listener can stop page scroll.
it('cancels the wheel so the form under the map does not scroll', () => {
  renderWithProviders(<SiteMap {...HOME} />);
  const map = screen.getByRole('group', { name: /Launch site map/ });
  const notPrevented = fireEvent.wheel(map, { deltaY: -100 });
  expect(notPrevented).toBe(false);
});

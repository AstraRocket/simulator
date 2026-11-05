// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { LocationEditor } from '../../../src/components/sim/LocationEditor';
import { renderWithProviders } from '../../testing/renderWithProviders';
import type { LaunchLocation } from '../../../src/services/storage/launchLocationStore';

const HOME: LaunchLocation = {
  id: 'home',
  name: 'Home field',
  latitudeDeg: 39.05,
  longitudeDeg: -104.8,
  launchAltitudeM: 1830,
};

const render = (location: LaunchLocation | null, takenNames: string[] = []) => {
  const onSave = vi.fn();
  const onDirtyChange = vi.fn();
  renderWithProviders(
    <LocationEditor
      location={location}
      takenNames={takenNames}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
      onBack={vi.fn()}
    />,
  );
  return { onSave, onDirtyChange };
};

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

describe('LocationEditor, editing', () => {
  it('seeds every field from the location', () => {
    render(HOME);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Home field');
    expect(field('Latitude').value).toBe('39.05');
    expect(field('Longitude').value).toBe('-104.8');
    expect(field('Altitude').value).toBe('1830');
  });

  it('saves a corrected coordinate, keeping the location id', () => {
    const { onSave } = render(HOME);
    fireEvent.change(field('Latitude'), { target: { value: '39.1234' } });
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({ ...HOME, latitudeDeg: 39.1234 });
  });

  it('saves a corrected elevation', () => {
    const { onSave } = render(HOME);
    fireEvent.change(field('Altitude'), { target: { value: '1840' } });
    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0].launchAltitudeM).toBeCloseTo(1840, 6);
  });

  it('warns about a duplicate name without forbidding it', () => {
    const { onSave } = render(HOME, ['Other field']);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other field' } });
    expect(screen.getByText(/already has this name/i)).toBeTruthy();
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalled();
  });
});

describe('LocationEditor, the map', () => {
  it('shows the location it is editing', () => {
    render(HOME);
    expect(screen.getByText('39.0500° N, 104.8000° W')).toBeTruthy();
  });

  it('fills both coordinates from a click, which is how a field with no published numbers is entered', () => {
    const { onSave } = render(null);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'The club field' } });
    const map = screen.getByRole('group', { name: /Launch site map/ });
    fireEvent.pointerDown(map, { pointerId: 1, clientX: 160, clientY: 128 });
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 160, clientY: 128 });

    expect(field('Latitude').value).toBe('0');
    expect(field('Longitude').value).toBe('0');
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ latitudeDeg: 0, longitudeDeg: 0 });
  });

  it('moves the pin when a coordinate is typed', () => {
    render(HOME);
    fireEvent.change(field('Latitude'), { target: { value: '51.5' } });
    expect(screen.getByText('51.5000° N, 104.8000° W')).toBeTruthy();
  });
});

describe('LocationEditor, Enter', () => {
  it('saves from a field', () => {
    const { onSave } = render(HOME);
    fireEvent.keyDown(field('Latitude'), { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(HOME);
  });

  it('leaves Enter on a button to the button', () => {
    const { onSave } = render(HOME);
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    expect(fireEvent.keyDown(zoomIn, { key: 'Enter' })).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('picks the map center on Enter without saving the coordinates from before', () => {
    const { onSave } = render(HOME);
    const map = screen.getByRole('group', { name: /Launch site map/ });
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(field('Longitude').value).not.toBe('-104.8');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('LocationEditor, creating', () => {
  it('starts empty and refuses to save until it is a real place', () => {
    const { onSave } = render(null);
    expect(save().disabled).toBe(true);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'New field' } });
    // 0°,0° is a real place, so coordinates are required rather than defaulted.
    expect(save().disabled).toBe(true);

    fireEvent.change(field('Latitude'), { target: { value: '51.5' } });
    expect(save().disabled).toBe(true);
    fireEvent.change(field('Longitude'), { target: { value: '-0.12' } });
    expect(save().disabled).toBe(false);

    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: 'New field',
      latitudeDeg: 51.5,
      longitudeDeg: -0.12,
      launchAltitudeM: null,
    });
    expect(onSave.mock.calls[0]![0].id).toMatch(/[0-9a-f-]{8,}/);
  });

  it('clamps a coordinate to the range the store would accept', () => {
    const { onSave } = render(null);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Impossible' } });
    fireEvent.change(field('Latitude'), { target: { value: '120' } });
    fireEvent.change(field('Longitude'), { target: { value: '-400' } });
    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ latitudeDeg: 90, longitudeDeg: -180 });
  });
});

describe('LocationEditor, the unsaved-edit guard', () => {
  const discard = () => screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement;

  it('offers nothing to save or discard until something changes', () => {
    const { onDirtyChange } = render(HOME);
    expect(save().disabled).toBe(true);
    expect(discard().disabled).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a change so the list can ask before dropping it', () => {
    const { onDirtyChange } = render(HOME);
    fireEvent.change(field('Latitude'), { target: { value: '39.1234' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(save().disabled).toBe(false);
  });

  it('is clean again when an edit is typed back to what was stored', () => {
    const { onDirtyChange } = render(HOME);
    fireEvent.change(field('Latitude'), { target: { value: '39.1234' } });
    fireEvent.change(field('Latitude'), { target: { value: '39.05' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('puts every field back as it was stored', () => {
    render(HOME);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Renamed' } });
    fireEvent.change(field('Latitude'), { target: { value: '1' } });
    fireEvent.click(discard());
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Home field');
    expect(field('Latitude').value).toBe('39.05');
    expect(save().disabled).toBe(true);
  });
});

describe('LocationEditor, elevation', () => {
  it('saves a cleared elevation as unknown', () => {
    const { onSave } = render(HOME);
    fireEvent.change(field('Altitude'), { target: { value: '' } });
    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0].launchAltitudeM).toBeNull();
  });
});

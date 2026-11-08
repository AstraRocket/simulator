// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useConfirmStore } from '../../../src/state/confirmStore';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';
import type { MotorSpec } from '../../../src/engine/openRocketEngine';

const curve = {
  src: 'Certified · RASP',
  samples: [
    [0, 0],
    [0.5, 10],
    [1, 0],
  ] as [number, number][],
};
const X: CatalogMotor = {
  manufacturer: 'Test',
  designation: 'X',
  class: 'C',
  diameter: 18,
  impulse: 10,
  burn: 1,
  mass: 20,
  delays: '4,7,10',
  curves: [curve],
};
const Y: CatalogMotor = { ...X, designation: 'Y', delays: '3,5,8' };

const loadCatalog = vi.fn(() => Promise.resolve([X, Y]));
const deleteCustomMotor = vi.fn(async (_id: string) => [X, Y]);
vi.mock('../../../src/services/motors/motorDb', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadCatalog: () => loadCatalog(),
  deleteCustomMotor: (id: string) => deleteCustomMotor(id),
  importCustomMotors: () => importCustomMotors(),
}));
const importCustomMotors = vi.fn(async () => ({ catalog: [X, Y], imported: 1, failed: [] as string[] }));
const catalogMotorSpec = vi.fn<(m: CatalogMotor, delay: number) => Promise<MotorSpec>>();
vi.mock('../../../src/services/motors/motorSpec', () => ({
  catalogMotorSpec: (m: CatalogMotor, d: number) => catalogMotorSpec(m, d),
}));

const { MotorDialog } = await import('../../../src/components/sim/MotorDialog');

const seatedX: MotorSpec = {
  designation: 'X',
  manufacturer: 'Test',
  diameter: 0.018,
  length: 0.07,
  times: [0, 1],
  thrusts: [10, 0],
  masses: [0.02, 0.01],
  cgX: 0.035,
  ejectionDelay: 7,
  curveSrc: curve.src,
};

function Host({ current, onSelect }: { current: MotorSpec | null; onSelect: (m: MotorSpec) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open picker</button>
      {open && <MotorDialog onClose={() => setOpen(false)} onSelect={onSelect} onError={() => {}} current={current} />}
    </>
  );
}

// The row's name is its inline spans run together: "XTest10 N·s · 18 mm".
const row = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name}\\s?Test`) });
const delayBox = () => screen.getByRole('spinbutton', { name: 'Delay' }) as HTMLInputElement;
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'open picker' }));
const closePicker = () => fireEvent.click(screen.getByRole('button', { name: 'Close' }));

beforeEach(() => {
  loadCatalog.mockClear();
  catalogMotorSpec.mockReset();
  importCustomMotors.mockClear();
  localStorage.clear();
});

describe('MotorDialog', () => {
  it('does not leak the seated delay onto the next pick after a reopen', async () => {
    renderWithProviders(<Host current={seatedX} onSelect={() => {}} />);
    openPicker();
    await row('X');
    await waitFor(() => expect(delayBox().value).toBe('7'));
    expect((await row('X')).getAttribute('aria-pressed')).toBe('true');

    closePicker();
    openPicker();
    fireEvent.click(await row('Y'));
    expect(delayBox().value).toBe('5');
    expect(screen.getByRole('button', { name: '5', pressed: true })).toBeTruthy();
  });

  it('drops a pick that resolves after the dialog was closed', async () => {
    let resolve!: (m: MotorSpec) => void;
    catalogMotorSpec.mockReturnValue(new Promise<MotorSpec>((r) => (resolve = r)));
    const onSelect = vi.fn();
    renderWithProviders(<Host current={null} onSelect={onSelect} />);
    openPicker();
    fireEvent.click(await row('X'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(catalogMotorSpec).toHaveBeenCalledTimes(1);

    closePicker();
    await act(async () => {
      resolve(seatedX);
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps a pending pick when an import finishes meanwhile', async () => {
    let resolve!: (m: MotorSpec) => void;
    catalogMotorSpec.mockReturnValue(new Promise<MotorSpec>((r) => (resolve = r)));
    const onSelect = vi.fn();
    renderWithProviders(<Host current={null} onSelect={onSelect} />);
    openPicker();
    fireEvent.click(await row('X'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    const file = new File(['x'], 'm.eng');
    fireEvent.change(document.body.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await waitFor(() => expect(importCustomMotors).toHaveBeenCalledTimes(1));
    await screen.findByText(/1 motor imported/);

    await act(async () => {
      resolve(seatedX);
    });
    expect(onSelect).toHaveBeenCalledWith(seatedX);
  });

  it('keeps the last delay when the delay box is cleared', async () => {
    catalogMotorSpec.mockResolvedValue(seatedX);
    renderWithProviders(<Host current={null} onSelect={() => {}} />);
    openPicker();
    fireEvent.click(await row('X'));
    fireEvent.change(delayBox(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(catalogMotorSpec).toHaveBeenCalledWith(X, 7);
  });

  it('applies a pick that resolves while the dialog is still open', async () => {
    catalogMotorSpec.mockResolvedValue(seatedX);
    const onSelect = vi.fn();
    renderWithProviders(<Host current={null} onSelect={onSelect} />);
    openPicker();
    fireEvent.click(await row('X'));
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(seatedX));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the highlighted motor across a filter change', async () => {
    renderWithProviders(<Host current={null} onSelect={() => {}} />);
    openPicker();
    fireEvent.click(await row('X'));
    const search = screen.getByRole('textbox', { name: /Search by code/ });
    fireEvent.change(search, { target: { value: 'Y' } });
    expect(screen.queryByRole('button', { name: /^X\s?Test/ })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect((await row('X')).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers no Select while the filter hides the highlighted motor', async () => {
    renderWithProviders(<Host current={null} onSelect={() => {}} />);
    openPicker();
    fireEvent.click(await row('X'));
    expect(screen.getByRole('button', { name: /^Select$/ })).toBeTruthy();
    const search = screen.getByRole('textbox', { name: /Search by code/ });
    fireEvent.change(search, { target: { value: 'Y' } });
    expect(screen.queryByRole('button', { name: /^Select$/ })).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('button', { name: /^Select$/ })).toBeTruthy();
  });
});

describe('MotorDialog deleting an imported motor', () => {
  it('asks first, and keeps the motor when the answer is no', async () => {
    const Z: CatalogMotor = { ...X, designation: 'Z', custom: true, id: 'z1' };
    loadCatalog.mockImplementationOnce(() => Promise.resolve([Z, X]));
    renderWithProviders(<Host current={null} onSelect={() => {}} />);
    openPicker();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete imported motor Z' }));
    await waitFor(() => expect(useConfirmStore.getState().request?.danger).toBe(true));
    act(() => useConfirmStore.getState().settle(false));
    await new Promise((r) => setTimeout(r, 10));
    expect(deleteCustomMotor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete imported motor Z' }));
    await waitFor(() => expect(useConfirmStore.getState().request).not.toBeNull());
    act(() => useConfirmStore.getState().settle(true));
    await waitFor(() => expect(deleteCustomMotor).toHaveBeenCalledWith('z1'));
  });
});

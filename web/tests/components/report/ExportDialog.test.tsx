// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

const assembleReport = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/report/reportModel', async (orig) => ({
  ...(await orig<typeof import('../../../src/services/report/reportModel')>()),
  assembleReport,
}));

const downloadReportPdf = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/report/reportPdf', () => ({ downloadReportPdf }));

import { ExportDialog } from '../../../src/components/report/ExportDialog';
import { readSettings, renderWithProviders, seedSettings } from '../../testing/renderWithProviders';
import { useWorkspaceStore } from '../../../src/state/store';
import type { ReportModel } from '../../../src/services/report/reportModel';

const model = (): ReportModel =>
  ({
    name: 'Test Rocket',
    stages: [{ id: 's1', type: 'stage', name: 'Sustainer', children: [{ id: 'f1', type: 'trapezoidfinset' }] }],
    whole: {},
    stageSummaries: [{}],
    configs: [],
    partsByStage: [{ stage: 'Sustainer', rows: [] }],
    finSetsByStage: [{ stage: 'Sustainer', sets: [] }],
  }) as unknown as ReportModel;

beforeEach(() => {
  assembleReport.mockReset().mockReturnValue(model());
  downloadReportPdf.mockReset();
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ info: {}, rocket: {} } as never);
});

const open = () => {
  const onClose = vi.fn();
  renderWithProviders(<ExportDialog onClose={onClose} />);
  return onClose;
};

function Live() {
  const [isOpen, setOpen] = useState(true);
  return <>{isOpen && <ExportDialog onClose={() => setOpen(false)} />}</>;
}
const openLive = () => renderWithProviders(<Live />);

const settingsPopover = () =>
  screen.queryByRole('heading', { name: 'Print settings' })?.closest('[role="dialog"]') ?? null;
const settingsBackdrop = () => settingsPopover()!.parentElement as HTMLElement;

describe('ExportDialog', () => {
  it('shows the assembled design and its per-stage checkboxes', () => {
    open();
    expect(screen.getByText('Test Rocket')).toBeTruthy();
    expect(screen.getByText('Sustainer')).toBeTruthy();
  });

  it('dismissing the settings popover does not close the dialog behind it', () => {
    const onClose = open();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const pop = settingsPopover();
    expect(pop).toBeTruthy();

    fireEvent.pointerDown(settingsBackdrop());
    fireEvent.click(settingsBackdrop());
    expect(settingsPopover()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Test Rocket')).toBeTruthy();
  });

  it('keeps the selection across opening and dismissing the settings popover', () => {
    openLive();
    const parts = screen.getByLabelText('Parts detail') as HTMLInputElement;
    fireEvent.click(parts);
    expect((screen.getByLabelText('Parts detail') as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(settingsBackdrop());

    expect((screen.getByLabelText('Parts detail') as HTMLInputElement).checked).toBe(false);
    expect(assembleReport).toHaveBeenCalledTimes(1);
  });

  // The popover must be open when Escape is pressed, or this passes either way.
  it('Escape closes the settings popover, not the dialog behind it', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(settingsPopover()).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(settingsPopover()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection when the popover is dismissed with Escape', () => {
    openLive();
    const parts = screen.getByLabelText('Parts detail') as HTMLInputElement;
    fireEvent.click(parts);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect((screen.getByLabelText('Parts detail') as HTMLInputElement).checked).toBe(false);
    expect(assembleReport).toHaveBeenCalledTimes(1);
  });

  it('moves the focus trap to the popover while it is open', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const pop = settingsPopover()!;
    expect(pop.contains(document.activeElement)).toBe(true);
  });

  it('closes on the overlay itself, and on Escape', () => {
    const onClose = open();
    const overlay = document.querySelector('.dialog-overlay')!;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('reports a failed simulation and writes no PDF', async () => {
    useWorkspaceStore.setState({ runSim: async () => Promise.reject(new Error('kernel choked')) } as never);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(useWorkspaceStore.getState().err).toContain('kernel choked'));
    expect(downloadReportPdf).not.toHaveBeenCalled();
  });

  it.each(['failed', 'skipped', 'canceled', 'dropped', 'busy'])(
    'writes no PDF when the simulation comes back %s',
    async (outcome) => {
      useWorkspaceStore.setState({ runSim: async () => outcome } as never);
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
      await screen.findByRole('button', { name: 'Save as PDF' });
      expect(downloadReportPdf).not.toHaveBeenCalled();
    },
  );

  it('writes the PDF once the simulation has landed', async () => {
    useWorkspaceStore.setState({ runSim: async () => 'landed' } as never);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalledTimes(1));
  });

  it('does not close on the overlay or Escape while the export is running', async () => {
    useWorkspaceStore.setState({ runSim: () => new Promise<void>(() => {}) } as never);
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await screen.findByRole('button', { name: 'Loading…' });

    const overlay = document.querySelector('.dialog-overlay')!;
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ExportDialog cancel', () => {
  it.each(['Cancel', 'Close'])('%s stops the run and writes no PDF', async (name) => {
    let finish: (outcome: string) => void = () => {};
    const cancelRun = vi.fn();
    useWorkspaceStore.setState({
      runSim: () => new Promise<string>((resolve) => (finish = resolve)),
      cancelRun,
    } as never);
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await screen.findByRole('button', { name: 'Loading…' });

    fireEvent.click(screen.getAllByRole('button', { name })[0]!);
    expect(onClose).toHaveBeenCalled();
    expect(cancelRun).toHaveBeenCalledTimes(1);

    finish('landed');
    await screen.findByRole('button', { name: 'Save as PDF' });
    expect(downloadReportPdf).not.toHaveBeenCalled();
  });

  it('a close during the font fetch reaches the writer', async () => {
    let hooks: { canceled?: () => boolean } = {};
    let fontsLoaded: () => void = () => {};
    downloadReportPdf.mockImplementation(async (...args: unknown[]) => {
      hooks = (args[5] ?? {}) as typeof hooks;
      await new Promise<void>((resolve) => (fontsLoaded = resolve));
    });
    useWorkspaceStore.setState({ runSim: async () => 'landed' } as never);
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalledTimes(1));
    expect(hooks.canceled?.()).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hooks.canceled?.()).toBe(true);
    fontsLoaded();
  });
});

describe('ExportDialog background run', () => {
  it('puts the view, the tab and the design pane back after the run', async () => {
    useWorkspaceStore.setState({ view: '3d', tab: 'design', designPane: 'stats' } as never);
    useWorkspaceStore.setState({
      runSim: async () => {
        useWorkspaceStore.setState({ view: 'flight', tab: 'results' } as never);
        return 'landed';
      },
    } as never);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(downloadReportPdf).toHaveBeenCalledTimes(1));
    const s = useWorkspaceStore.getState();
    expect([s.view, s.tab, s.designPane]).toEqual(['3d', 'design', 'stats']);
  });
});

describe('ExportDialog print settings labels', () => {
  it('names the fill color input and keeps the fill label on the checkbox alone', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const fill = screen.getByRole('checkbox', { name: 'Template fill color' });
    expect(fill.closest('label')).toBeNull();
    expect(screen.getByLabelText('Choose the fill color').getAttribute('type')).toBe('color');
  });
});

describe('ExportDialog dropped run', () => {
  it('says why no PDF was written', async () => {
    useWorkspaceStore.setState({ runSim: async () => 'dropped', err: null } as never);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(useWorkspaceStore.getState().err).toMatch(/design changed/));
    expect(downloadReportPdf).not.toHaveBeenCalled();
  });
});

describe('ExportDialog print settings reset', () => {
  it('leaves the report units alone', () => {
    seedSettings({
      report: {
        units: 'metric',
        templateFill: '#ff0000',
        templateStroke: '#00ff00',
        paper: 'a4',
        orientation: 'landscape',
      },
    } as never);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    const report = readSettings()['report'] as Record<string, string>;
    expect(report['units']).toBe('metric');
    expect(report['paper']).toBe('letter');
    expect(report['templateFill']).toBe('');
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { ToolsPane } from '../../../src/components/tools/ToolsPane';
import { forgetToolsPane } from '../../../src/components/tools/toolsPaneMemory';
import { forgetParachuteTool } from '../../../src/components/tools/parachuteToolMemory';
import { forgetLandingEstimator } from '../../../src/components/tools/landingEstimatorMemory';
import { forgetFlutterTool } from '../../../src/components/tools/flutterToolMemory';
import { forgetEjectionTool } from '../../../src/components/tools/ejectionToolMemory';
import { forgetMotorsTool } from '../../../src/components/tools/motorsToolMemory';
import { MotorDashboard } from '../../../src/components/sim/MotorDashboard';
import { renderWithProviders } from '../../testing/renderWithProviders';

const SEARCH = 'Search by code (e.g. C6)…';

beforeEach(() => {
  forgetToolsPane();
  forgetMotorsTool();
  forgetParachuteTool();
  forgetLandingEstimator();
  forgetFlutterTool();
  forgetEjectionTool();
});

describe('the Tools tab', () => {
  it('opens on the landing estimator, and switches tools from a tab list', () => {
    renderWithProviders(<ToolsPane />);
    expect(screen.getByRole('heading', { name: 'Landing estimator' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    expect(screen.getByRole('heading', { name: 'Parachute sizing' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Landing estimator' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Parachute sizing' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lists the tools alphabetically, and arrow keys follow that order', () => {
    renderWithProviders(<ToolsPane />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Ejection charge',
      'Fin flutter',
      'Landing estimator',
      'Motor Dashboard',
      'Parachute sizing',
    ]);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Landing estimator' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Motor Dashboard' }).getAttribute('aria-selected')).toBe('true');
  });

  it('holds the motor dashboard, and keeps its filters across a trip to another tab', () => {
    const { unmount } = renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Motor Dashboard' }));
    expect(screen.getByRole('heading', { name: 'Motor Dashboard' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Left on the tab list, so arrow keys go on moving between tools.
    expect(document.activeElement).not.toBe(screen.getByLabelText(SEARCH));
    fireEvent.change(screen.getByLabelText(SEARCH), { target: { value: 'H128' } });
    unmount();
    renderWithProviders(<ToolsPane />);
    expect((screen.getByLabelText(SEARCH) as HTMLInputElement).value).toBe('H128');
  });

  it('opens the exhaust styles from the dashboard, and goes back to the list', () => {
    renderWithProviders(<MotorDashboard onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exhaust styles' }));
    expect(screen.getByRole('heading', { name: 'Dark smoke' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back to list/ }));
    expect(screen.queryByRole('heading', { name: 'Dark smoke' })).toBeNull();
    expect(screen.getByLabelText(SEARCH)).toBeTruthy();
  });

  it('leaves the menu dialog with its own filters, starting fresh each time', () => {
    const tool = renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Motor Dashboard' }));
    fireEvent.change(screen.getByLabelText(SEARCH), { target: { value: 'H128' } });
    tool.unmount();
    renderWithProviders(<MotorDashboard onClose={() => {}} />);
    expect((screen.getByLabelText(SEARCH) as HTMLInputElement).value).toBe('');
  });

  it('sizes a parachute from typed inputs, and rates a canopy given one', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    const result = screen.getByRole('region', { name: 'Parachute sizing result' });
    expect(result.textContent).toMatch(/Main \(/);
    expect(result.textContent).not.toMatch(/This canopy/);
    expect(screen.queryByRole('button', { name: 'Use the main diameter' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Canopy diameter'), { target: { value: '60' } });
    expect(result.textContent).toMatch(/This canopy/);
  });

  it('sizes for the air at the site when a temperature is typed', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    const result = screen.getByRole('region', { name: 'Parachute sizing result' });
    const main = () => within(result).getByText(/^Main \(/).nextElementSibling?.textContent;
    fireEvent.change(screen.getByLabelText('Site elevation'), { target: { value: '2682' } });
    const blank = main();
    // -2.4 C is standard at 2,682 m, so the canopy size is unchanged.
    fireEvent.change(screen.getByLabelText('Temperature'), { target: { value: '-2.4' } });
    expect(main()).toBe(blank);
  });

  it('keeps the site elevation when its box is cleared, rather than sizing for sea level', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    const result = screen.getByRole('region', { name: 'Parachute sizing result' });
    const main = () => within(result).getByText(/^Main \(/).nextElementSibling?.textContent;
    const site = screen.getByLabelText('Site elevation');
    fireEvent.change(site, { target: { value: '2682' } });
    const high = main();
    fireEvent.change(site, { target: { value: '' } });
    fireEvent.blur(site);
    expect(main()).toBe(high);
  });

  it('keeps each tool as it was left across a trip to another tab', () => {
    const { unmount } = renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    fireEvent.change(screen.getByLabelText('Canopy diameter'), { target: { value: '60' } });
    unmount();
    renderWithProviders(<ToolsPane />);
    expect(screen.getByRole('heading', { name: 'Parachute sizing' })).toBeTruthy();
    expect((screen.getByLabelText('Canopy diameter') as HTMLInputElement).value).toBe('60');
  });

  it('rates a fin against the top speed, from typed inputs', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fin flutter' }));
    const result = screen.getByRole('region', { name: 'Fin flutter result' });
    expect(result.textContent).toMatch(/Enter the fin/);
    fireEvent.change(screen.getByLabelText('Root chord'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Tip chord'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Height'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Thickness'), { target: { value: '0.3175' } });
    expect(result.textContent).toMatch(/Flutter speed/);
    expect(result.textContent).not.toMatch(/Margin over top speed/);
    const speed = screen.getByLabelText('Top speed');
    fireEvent.change(speed, { target: { value: '150' } });
    expect(result.textContent).toMatch(/At least/);
    fireEvent.change(speed, { target: { value: '220' } });
    expect(result.textContent).toMatch(/too close/);
    fireEvent.change(speed, { target: { value: '300' } });
    expect(result.textContent).toMatch(/goes faster than/);
  });

  it('switches the fin stock to Custom when its shear modulus is typed', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Fin flutter' }));
    const stock = screen.getByLabelText('Fin stock') as HTMLSelectElement;
    expect(stock.value).toBe('g10');
    const shear = screen.getByLabelText('Shear modulus');
    fireEvent.change(shear, { target: { value: '5000000' } });
    fireEvent.blur(shear);
    expect(stock.value).toBe('custom');
    fireEvent.change(stock, { target: { value: 'aluminum' } });
    // 26 GPa, shown in hPa.
    expect((screen.getByLabelText('Shear modulus') as HTMLInputElement).value).toBe('260000000');
  });

  it('sizes an ejection charge, and warns when the target will not shear the pins', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Ejection charge' }));
    const result = screen.getByRole('region', { name: 'Ejection charge result' });
    fireEvent.change(screen.getByLabelText('Inside diameter'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Bay length'), { target: { value: '25' } });
    expect(result.textContent).toMatch(/Black powder/);
    expect(result.textContent).not.toMatch(/Pressure to shear/);
    fireEvent.change(screen.getByLabelText('Pin count'), { target: { value: '3' } });
    const force = screen.getByLabelText('Shear strength per pin');
    fireEvent.change(force, { target: { value: '100' } });
    expect(result.textContent).toMatch(/Pressure to shear the pins/);
    expect(result.textContent).not.toMatch(/will not separate/);
    fireEvent.change(force, { target: { value: '500' } });
    expect(result.textContent).toMatch(/will not separate/);
  });
});

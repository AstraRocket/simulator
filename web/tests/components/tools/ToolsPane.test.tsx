// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { forgetToolsPane, ToolsPane } from '../../../src/components/tools/ToolsPane';
import { forgetParachuteTool } from '../../../src/components/tools/ParachuteTool';
import { forgetLandingEstimator } from '../../../src/components/tools/LandingEstimator';
import { forgetFlutterTool } from '../../../src/components/tools/FlutterTool';
import { forgetEjectionTool } from '../../../src/components/tools/EjectionTool';
import { renderWithProviders } from '../../testing/renderWithProviders';

beforeEach(() => {
  forgetToolsPane();
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
    // Only the open tool is in the document.
    expect(screen.queryByRole('heading', { name: 'Landing estimator' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Parachute sizing' }).getAttribute('aria-selected')).toBe('true');
  });

  it('sizes a parachute from typed inputs, and rates a canopy given one', () => {
    renderWithProviders(<ToolsPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'Parachute sizing' }));
    const result = screen.getByRole('region', { name: 'Parachute sizing result' });
    expect(result.textContent).toMatch(/Main \(/);
    expect(result.textContent).not.toMatch(/This canopy/);
    // No buttons to apply a size: there is no design here to apply it to.
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
    // The standard temperature at 2,682 m is about -2.4 C; typing it keeps the
    // site's own pressure, so the canopy stays the size the blank field gave.
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
    // A 15 cm root, 5 cm tip, 10 cm high G10 fin of 1/8 in stock flutters near 231 m/s at sea level.
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
    // 26 GPa in the metric default hPa.
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
    // 300 N over a 10 cm bore is about 382 hPa, under the default 15 psi.
    fireEvent.change(force, { target: { value: '100' } });
    expect(result.textContent).toMatch(/Pressure to shear the pins/);
    expect(result.textContent).not.toMatch(/will not separate/);
    // 1,500 N is about 1,910 hPa, over it.
    fireEvent.change(force, { target: { value: '500' } });
    expect(result.textContent).toMatch(/will not separate/);
  });
});

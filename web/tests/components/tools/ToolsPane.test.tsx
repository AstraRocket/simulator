// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { forgetToolsPane, ToolsPane } from '../../../src/components/tools/ToolsPane';
import { forgetParachuteTool } from '../../../src/components/tools/ParachuteTool';
import { forgetLandingEstimator } from '../../../src/components/tools/LandingEstimator';
import { renderWithProviders } from '../../testing/renderWithProviders';

beforeEach(() => {
  forgetToolsPane();
  forgetParachuteTool();
  forgetLandingEstimator();
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
});

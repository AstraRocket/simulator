// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { readSettings, renderWithProviders } from '../../testing/renderWithProviders';
import { FlyerTab } from '../../../src/components/layout/FlyerTab';

beforeEach(() => localStorage.clear());

const saved = () => readSettings()['flyer'] as { name: string; memberships: Record<string, unknown>[] };

describe('Settings ▸ Flyer', () => {
  it('saves the name and each membership, and names an Other by what is typed', () => {
    renderWithProviders(<FlyerTab />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pat' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add membership' }));
    fireEvent.change(screen.getByLabelText('Member number'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Highest certification'), { target: { value: '2' } });
    expect(saved()).toEqual({ name: 'Pat', memberships: [{ org: 'nar', orgName: '', number: '12345', level: 2 }] });

    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'UKRA' } });
    expect(saved().memberships[0]).toMatchObject({ org: 'other', orgName: 'UKRA' });
  });

  it('removes a membership', () => {
    renderWithProviders(<FlyerTab />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add membership' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove the NAR membership' }));
    expect(saved().memberships).toEqual([]);
  });

  it('names an Other membership with no name yet as Other on its remove button', () => {
    renderWithProviders(<FlyerTab />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add membership' }));
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'other' } });
    expect(screen.getByRole('button', { name: 'Remove the Other membership' })).toBeTruthy();
  });
});

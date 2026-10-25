// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import i18n from '../../../src/i18n';
import { PropertyPanel } from '../../../src/components/design/PropertyPanel';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { serveData } from '../../testing/serveData';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';

beforeAll(serveData);

/**
 * The property panel's delays carry the reader's own seconds symbol, as the
 * configuration card's override of the same field does ("秒" in Japanese, "с"
 * in Russian), not a fixed "s".
 */
describe('the seconds symbol in the property panel', () => {
  it('is whatever the locale says, not a fixed letter', () => {
    // A sentinel, so a hard-coded "s" cannot pass.
    const own = i18n.t('units.second');
    i18n.addResource('en', 'translation', 'units.second', 'sec');
    try {
      const chute = {
        type: 'parachute',
        id: 'c',
        name: 'Main',
        deployEvent: 'apogee',
        deployDelay: 1,
      } as ComponentNode;
      renderWithProviders(<PropertyPanel node={chute} onChange={vi.fn()} onCommit={() => {}} onRemove={() => {}} />);
      expect(screen.getAllByText('sec').length).toBeGreaterThan(0);
    } finally {
      i18n.addResource('en', 'translation', 'units.second', own);
    }
  });
});

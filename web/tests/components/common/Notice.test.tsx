// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notice } from '../../../src/components/common/Notice';

describe('Notice', () => {
  it('is polite as a status and assertive as an alert', () => {
    render(
      <>
        <Notice tone="warn" role="status">
          Heads up
        </Notice>
        <Notice tone="danger" role="alert">
          Broke
        </Notice>
      </>,
    );
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByRole('alert').hasAttribute('aria-live')).toBe(false);
  });

  it('takes its tone and size', () => {
    render(
      <Notice tone="warn" size="fine">
        Small
      </Notice>,
    );
    const p = screen.getByText('Small');
    expect(p.className).toContain('text-warn-200');
    expect(p.className).toContain('text-[11px]');
    expect(p.hasAttribute('role')).toBe(false);
  });
});

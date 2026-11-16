// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LAxes, YGridRows } from '../../../src/components/common/chartAxes';

const texts = (root: Element) => [...root.querySelectorAll('text')].map((n) => n.textContent);

describe('YGridRows', () => {
  it('draws one labeled grid line per value at its height', () => {
    const { container } = render(
      <svg>
        <YGridRows values={[0, 5, 10]} Y={(v) => 100 - v} x1={40} x2={200} label={(v) => `${v} N`} />
      </svg>,
    );
    const lines = [...container.querySelectorAll('line')];
    expect(lines.map((l) => l.getAttribute('y1'))).toEqual(['100', '95', '90']);
    expect(lines[0]!.getAttribute('x2')).toBe('200');
    expect(texts(container)).toEqual(['0 N', '5 N', '10 N']);
  });
});

describe('LAxes', () => {
  const frame = { width: 300, height: 200, padL: 40, padR: 10, padT: 10, padB: 30 };

  it('draws both axes with end values and units', () => {
    const { container } = render(
      <svg>
        <LAxes frame={frame} xLo="0" xHi="12" xSym="m/s" yLo="0" yHi="900" ySym="m" />
      </svg>,
    );
    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(texts(container)).toEqual(['900', '0', 'm', '0', '12', 'm/s']);
  });

  it('leaves the y values out when not given', () => {
    const { container } = render(
      <svg>
        <LAxes frame={frame} xLo="0" xHi="12" xSym="m/s" ySym="m" />
      </svg>,
    );
    expect(texts(container)).toEqual(['m', '0', '12', 'm/s']);
  });
});

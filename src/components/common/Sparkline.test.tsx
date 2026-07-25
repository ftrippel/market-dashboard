// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { Sparkbar } from './Sparkbar';
import { Sparkdots } from './Sparkdots';
import { Sparkline } from './Sparkline';

describe('spark chart loading dimensions', () => {
  it.each([
    ['line', Sparkline],
    ['bar', Sparkbar],
    ['dots', Sparkdots],
  ])('reserves the final size for an empty %s chart', (_name, Component) => {
    const { container } = render(
      <ThemeProvider>
        <Component data={[]} />
      </ThemeProvider>,
    );
    const canvas = container.querySelector('canvas');

    expect(canvas?.getAttribute('width')).toBe('64');
    expect(canvas?.getAttribute('height')).toBe('26');
    expect(canvas?.style.width).toBe('64px');
    expect(canvas?.style.height).toBe('26px');
  });
});

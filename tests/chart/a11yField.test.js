import { describe, it, expect } from 'vitest';
import { describeData, ensureA11yElement } from '../../src/chart/a11yField.js';

describe('describeData', () => {
  const identity = (d) => d;

  it('returns a fixed message for no data', () => {
    expect(describeData([], identity)).toBe('No data.');
  });

  it('describes a single numeric data point (singular)', () => {
    expect(describeData([5], identity)).toBe('1 data point, values ranging from 5 to 5.');
  });

  it('describes multiple numeric data points with min/max', () => {
    expect(describeData([3, 9, 1], identity)).toBe('3 data points, values ranging from 1 to 9.');
  });

  it('falls back to a count-only message when no accessor output is numeric', () => {
    expect(describeData([{ a: 1 }, { a: 2 }], identity)).toBe('2 data points.');
  });

  it('ignores non-finite accessor output when computing the range', () => {
    expect(describeData([1, NaN, 5], identity)).toBe('3 data points, values ranging from 1 to 5.');
  });
});

describe('ensureA11yElement', () => {
  it('returns the existing element unchanged, ignoring container', () => {
    const existing = document.createElement('div');
    expect(ensureA11yElement(existing, null)).toBe(existing);
  });

  it('creates and inserts a new element right after container', () => {
    const container = document.createElement('canvas');
    const parent = document.createElement('div');
    parent.appendChild(container);

    const element = ensureA11yElement(null, container);

    expect(element).toBeInstanceOf(HTMLElement);
    expect(container.nextSibling).toBe(element);
    expect(parent.contains(element)).toBe(true);
  });

  it('throws TypeError when there is no existing element and container is missing', () => {
    expect(() => ensureA11yElement(null, undefined)).toThrow(TypeError);
  });

  it('throws TypeError when container is not a DOM element', () => {
    expect(() => ensureA11yElement(null, {})).toThrow(TypeError);
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { KeyboardNav } from '../../src/interact/KeyboardNav.js';
import { BarChart } from '../../src/chart/BarChart.js';

function makeDomElement() {
  return { addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function listenerFor(domElement, type) {
  const call = domElement.addEventListener.mock.calls.find(([eventType]) => eventType === type);
  return call[1];
}

function makeChart(rows) {
  const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

function tab(domElement, shiftKey = false) {
  listenerFor(domElement, 'keydown')({ key: 'Tab', shiftKey, preventDefault: vi.fn() });
}

function enter(domElement) {
  listenerFor(domElement, 'keydown')({ key: 'Enter' });
}

function esc(domElement) {
  listenerFor(domElement, 'keydown')({ key: 'Escape' });
}

describe('KeyboardNav constructor', () => {
  it('throws TypeError if domElement lacks addEventListener/removeEventListener', () => {
    expect(() => new KeyboardNav({ domElement: {} })).toThrow(TypeError);
  });

  it('throws TypeError if describe is given and is not a function', () => {
    expect(() => new KeyboardNav({ domElement: makeDomElement(), describe: 'nope' })).toThrow(TypeError);
  });

  it('registers a keydown listener', () => {
    const domElement = makeDomElement();
    new KeyboardNav({ domElement });
    expect(domElement.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('sets tabIndex to 0 if the element has none', () => {
    const domElement = makeDomElement();
    new KeyboardNav({ domElement });
    expect(domElement.tabIndex).toBe(0);
  });

  it('does not clobber an existing non-negative tabIndex', () => {
    const domElement = { ...makeDomElement(), tabIndex: 3 };
    new KeyboardNav({ domElement });
    expect(domElement.tabIndex).toBe(3);
  });

  it('creates a visually-hidden aria-live region appended to the document', () => {
    const nav = new KeyboardNav({ domElement: makeDomElement() });
    expect(nav.liveRegion.getAttribute('aria-live')).toBe('polite');
    expect(document.body.contains(nav.liveRegion)).toBe(true);
    nav.dispose();
  });
});

describe('KeyboardNav.register / unregister', () => {
  it('throws TypeError if chart lacks selection()/data() methods', () => {
    const nav = new KeyboardNav({ domElement: makeDomElement() });
    expect(() => nav.register({})).toThrow(TypeError);
    nav.dispose();
  });

  it('returns this for chaining, register is idempotent', () => {
    const nav = new KeyboardNav({ domElement: makeDomElement() });
    const chart = makeChart([{ id: 0, value: 1 }]);
    expect(nav.register(chart)).toBe(nav);
    expect(nav.register(chart)).toBe(nav);
    expect(nav.unregister(chart)).toBe(nav);
    nav.dispose();
  });
});

describe('KeyboardNav Tab cycling', () => {
  it('Tab focuses the first datum of the first registered chart, wraps at the end', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    nav.register(chart);

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('1 of 2');

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('2 of 2');

    tab(domElement); // wraps back to the first
    expect(nav.liveRegion.textContent).toContain('1 of 2');
    nav.dispose();
  });

  it('Shift+Tab moves backwards and wraps', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }, { id: 2, value: 3 }]);
    nav.register(chart);

    tab(domElement, true); // starting index is -1; the first Shift+Tab lands on the 2nd entry
    expect(nav.liveRegion.textContent).toContain('2 of 3');

    tab(domElement, true); // from there, every further Shift+Tab genuinely decrements...
    expect(nav.liveRegion.textContent).toContain('1 of 3');

    tab(domElement, true); // ...and wraps to the last entry once it walks past the first.
    expect(nav.liveRegion.textContent).toContain('3 of 3');
    nav.dispose();
  });

  it('calls preventDefault so the browser does not also shift DOM focus', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    nav.register(makeChart([{ id: 0, value: 1 }]));
    const preventDefault = vi.fn();
    listenerFor(domElement, 'keydown')({ key: 'Tab', shiftKey: false, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    nav.dispose();
  });

  it('cycles across multiple registered charts in registration order', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chartA = makeChart([{ id: 0, value: 1 }]);
    const chartB = makeChart([{ id: 0, value: 1 }]);
    nav.register(chartA).register(chartB);

    tab(domElement);
    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('2 of 2');

    tab(domElement); // wraps back to chartA's only datum
    expect(nav.liveRegion.textContent).toContain('1 of 2');
    nav.dispose();
  });

  it('is a no-op when nothing is registered', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    expect(() => tab(domElement)).not.toThrow();
    expect(nav.liveRegion.textContent).toBe('');
    nav.dispose();
  });

  it('transitions the newly-focused datum to focused, and the previously-focused one back to default', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    nav.register(chart);
    const [first, second] = chart.data();

    tab(domElement);
    expect(nav.stateMachineFor(chart).stateOf(first)).toBe('focused');

    tab(domElement);
    expect(nav.stateMachineFor(chart).stateOf(first)).toBe('default');
    expect(nav.stateMachineFor(chart).stateOf(second)).toBe('focused');
    nav.dispose();
  });
});

describe('KeyboardNav Enter / Escape', () => {
  it('Enter selects the currently focused datum', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }]);
    nav.register(chart);
    const [datum] = chart.data();

    tab(domElement);
    enter(domElement);
    expect(nav.stateMachineFor(chart).stateOf(datum)).toBe('selected');
    expect(nav.liveRegion.textContent).toContain('Selected');
    nav.dispose();
  });

  it('Enter with nothing focused is a no-op', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    nav.register(makeChart([{ id: 0, value: 1 }]));
    expect(() => enter(domElement)).not.toThrow();
    expect(nav.liveRegion.textContent).toBe('');
    nav.dispose();
  });

  it('Enter on a new focus target replaces the previous keyboard-driven selection', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    nav.register(chart);
    const [first, second] = chart.data();

    tab(domElement);
    enter(domElement);
    expect(nav.stateMachineFor(chart).stateOf(first)).toBe('selected');

    tab(domElement);
    enter(domElement);
    expect(nav.stateMachineFor(chart).stateOf(first)).toBe('default');
    expect(nav.stateMachineFor(chart).stateOf(second)).toBe('selected');
    nav.dispose();
  });

  it('Escape clears the current selection, restoring focused (not default) since it is still the focus target', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }]);
    nav.register(chart);
    const [datum] = chart.data();

    tab(domElement);
    enter(domElement);
    esc(domElement);
    expect(nav.stateMachineFor(chart).stateOf(datum)).toBe('focused');
    expect(nav.liveRegion.textContent).toBe('Selection cleared');
    nav.dispose();
  });

  it('Escape restores default (not focused) once the focus cursor has moved elsewhere', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    nav.register(chart);
    const [first] = chart.data();

    tab(domElement);
    enter(domElement);
    tab(domElement); // focus moves to the second datum, first is now only selected, not focused
    esc(domElement);
    expect(nav.stateMachineFor(chart).stateOf(first)).toBe('default');
    nav.dispose();
  });

  it('Escape with nothing selected is a no-op', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    nav.register(makeChart([{ id: 0, value: 1 }]));
    expect(() => esc(domElement)).not.toThrow();
    expect(nav.liveRegion.textContent).toBe('');
    nav.dispose();
  });
});

describe('KeyboardNav chart.dispatch() interaction events (Prompt 156)', () => {
  it('Tab fires chart.on("focus", ...) for the newly-focused chart', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }]);
    nav.register(chart);
    const handler = vi.fn();
    chart.on('focus', handler);

    tab(domElement);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ chart, datum: chart.data()[0] });
    nav.dispose();
  });

  it('Enter fires chart.on("select", ...) for the newly-selected chart', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }]);
    nav.register(chart);
    const handler = vi.fn();
    chart.on('select', handler);

    tab(domElement);
    enter(domElement);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ chart, datum: chart.data()[0] });
    nav.dispose();
  });

  it('Enter on a new target fires chart.on("deselect", ...) for the previous selection', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }, { id: 1, value: 2 }]);
    nav.register(chart);
    const deselectHandler = vi.fn();
    chart.on('deselect', deselectHandler);

    tab(domElement);
    enter(domElement); // selects the first datum
    tab(domElement);
    enter(domElement); // selects the second, deselecting the first
    expect(deselectHandler).toHaveBeenCalledTimes(1);
    expect(deselectHandler.mock.calls[0][0]).toMatchObject({ chart, datum: chart.data()[0] });
    nav.dispose();
  });

  it('Escape fires chart.on("deselect", ...) for the cleared selection', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const chart = makeChart([{ id: 0, value: 1 }]);
    nav.register(chart);
    const handler = vi.fn();
    chart.on('deselect', handler);

    tab(domElement);
    enter(domElement);
    esc(domElement);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ chart, datum: chart.data()[0] });
    nav.dispose();
  });
});

describe('KeyboardNav describe option', () => {
  it('uses a custom describe function for the announcement text', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement, describe: (datum) => `Item #${datum.id}` });
    nav.register(makeChart([{ id: 7, value: 1 }]));

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('Item #7');
    nav.dispose();
  });

  it('defaults to a key: value summary for plain object datums', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    nav.register(makeChart([{ id: 5, value: 9 }]));

    tab(domElement);
    expect(nav.liveRegion.textContent).toContain('id: 5');
    expect(nav.liveRegion.textContent).toContain('value: 9');
    nav.dispose();
  });
});

describe('KeyboardNav.dispose', () => {
  it('removes the keydown listener, removes the live region, and is idempotent', () => {
    const domElement = makeDomElement();
    const nav = new KeyboardNav({ domElement });
    const keydown = listenerFor(domElement, 'keydown');
    const liveRegion = nav.liveRegion;

    nav.dispose();
    expect(domElement.removeEventListener).toHaveBeenCalledWith('keydown', keydown);
    expect(document.body.contains(liveRegion)).toBe(false);
    expect(() => nav.dispose()).not.toThrow();
  });

  it('every public method throws after dispose', () => {
    const nav = new KeyboardNav({ domElement: makeDomElement() });
    nav.dispose();
    expect(() => nav.register(makeChart([{ id: 0, value: 1 }]))).toThrow(/disposed/);
    expect(() => nav.unregister({})).toThrow(/disposed/);
    expect(() => nav.stateMachineFor({})).toThrow(/disposed/);
  });
});

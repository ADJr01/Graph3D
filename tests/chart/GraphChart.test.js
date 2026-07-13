import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { GraphChart } from '../../src/chart/GraphChart.js';
import { Selection, generator, scale } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

function makeGenerator() {
  return { compute: vi.fn((data) => ({ positions: new Float32Array(0), data })) };
}

function makeMockRenderer() {
  return { render: vi.fn(), domElement: { toDataURL: vi.fn(() => 'data:image/png;base64,MOCK') } };
}

describe('GraphChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy', () => {
      expect(() => new GraphChart(null, makeGenerator())).toThrow(TypeError);
      expect(() => new GraphChart(undefined, makeGenerator())).toThrow(TypeError);
    });

    it('throws if generator is missing or lacks compute()', () => {
      expect(() => new GraphChart(makeScene(), null)).toThrow(TypeError);
      expect(() => new GraphChart(makeScene(), {})).toThrow(TypeError);
      expect(() => new GraphChart(makeScene(), { compute: 'nope' })).toThrow(TypeError);
    });

    it('exposes scene and generator via getters', () => {
      const scene = makeScene();
      const generator = makeGenerator();
      const chart = new GraphChart(scene, generator);
      expect(chart.scene).toBe(scene);
      expect(chart.generator).toBe(generator);
    });
  });

  describe('data(arr, keyFn) — join-native (Prompt 128)', () => {
    it('no-arg form reads the currently bound data — empty before any render()', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.data()).toEqual([]);
    });

    it('join form returns a Selection-based JoinResult, not this', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 1 }, { id: 2 }];
      const joined = chart.data(rows, (d) => d.id);
      expect(joined).not.toBe(chart);
      expect(joined).toBeInstanceOf(Selection);
      expect(typeof joined.enter).toBe('function');
      expect(typeof joined.exit).toBe('function');
      expect(typeof joined.join).toBe('function');
    });

    it('defaults to a positional (index) join when keyFn is omitted', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.data([{ id: 1 }, { id: 2 }])).not.toThrow();
    });

    it('an empty data array produces a non-throwing, empty enter() selection', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const joined = chart.data([]);
      expect(joined.enter().size()).toBe(0);
    });

    it('entering real data before any render() throws — no mesh template exists yet', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const joined = chart.data([{ id: 1 }], (d) => d.id);
      expect(() => joined.enter()).toThrow();
    });

    it('throws if arr is not an array', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.data(null)).toThrow(TypeError);
      expect(() => chart.data('nope')).toThrow(TypeError);
      expect(() => chart.data({})).toThrow(TypeError);
    });

    it('throws if keyFn is given and is not a function', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.data([], 'nope')).toThrow(TypeError);
    });
  });

  describe('x/y/z(accessorOrScale, scale)', () => {
    it('default to index (x), identity (y), and constant 0 (z)', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.x().accessor({ v: 1 }, 5)).toBe(5);
      expect(chart.y().accessor({ v: 1 }, 5)).toEqual({ v: 1 });
      expect(chart.z().accessor({ v: 1 }, 5)).toBe(0);
      expect(chart.x().scale).toBeNull();
    });

    it('sets accessor and optional scale, returning this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const fakeScale = vi.fn((v) => v * 2);
      expect(chart.x((d) => d.label, fakeScale)).toBe(chart);
      expect(chart.x().accessor({ label: 'a' }, 0)).toBe('a');
      expect(chart.x().scale).toBe(fakeScale);
    });

    it('wraps a constant value into a constant accessor', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.y(42);
      expect(chart.y().accessor({}, 0)).toBe(42);
    });

    it('accepts z without a scale (scale stays null)', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.z((d) => d.depth);
      expect(chart.z().scale).toBeNull();
    });

    it('throws for an invalid accessorOrScale type', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.x({})).toThrow(TypeError);
      expect(() => chart.y([])).toThrow(TypeError);
      expect(() => chart.z(true)).toThrow(TypeError);
    });
  });

  describe('color(accessorOrConstant, palette)', () => {
    it('defaults to null accessor and null palette', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.color()).toEqual({ accessor: null, palette: null });
    });

    it('sets accessor and optional palette, returning this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const fakePalette = (t) => `#${t}`;
      expect(chart.color((d) => d.value, fakePalette)).toBe(chart);
      expect(chart.color().accessor({ value: 7 }, 0)).toBe(7);
      expect(chart.color().palette).toBe(fakePalette);
    });
  });

  describe('size(valueOrFn) / shape(valueOrFn)', () => {
    it('default to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.size()).toBeNull();
      expect(chart.shape()).toBeNull();
    });

    it('wrap constants/functions and return this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.size((d) => d.population)).toBe(chart);
      expect(chart.size()({ population: 9 }, 0)).toBe(9);

      chart.shape('sphere');
      expect(chart.shape()({}, 0)).toBe('sphere');
    });
  });

  describe('material(presetName, options)', () => {
    it('defaults to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.material()).toBeNull();
    });

    it('sets a valid preset and returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.material('standard', { color: '#3b82f6' })).toBe(chart);
      expect(chart.material()).toEqual({ presetName: 'standard', options: { color: '#3b82f6' } });
    });

    it('defaults options to {} when omitted', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.material('neon');
      expect(chart.material().options).toEqual({});
    });

    it('throws for an unknown preset name', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.material('doesNotExist')).toThrow(TypeError);
    });

    it('rejects material namespace utilities that are not presets', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.material('addPlanarReflection')).toThrow(TypeError);
      expect(() => chart.material('setPaletteForAttribute')).toThrow(TypeError);
    });

    it('throws if options is not a plain object', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.material('standard', null)).toThrow(TypeError);
      expect(() => chart.material('standard', [])).toThrow(TypeError);
    });
  });

  describe('legend(options)', () => {
    it('defaults to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.legend()).toBeNull();
    });

    it('sets and returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const container = document.createElement('div');
      expect(chart.legend({ container })).toBe(chart);
      expect(chart.legend()).toEqual({ container });
    });

    it('throws if options is not a plain object, or container is not a DOM element', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.legend(null)).toThrow(TypeError);
      expect(() => chart.legend('nope')).toThrow(TypeError);
      expect(() => chart.legend({})).toThrow(TypeError);
      expect(() => chart.legend({ container: 'nope' })).toThrow(TypeError);
    });

    it('renders immediately when configured after color()/data()', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      const container = document.createElement('div');
      chart.data([{ v: 1 }, { v: 5 }]);
      chart.color((d) => d.v);

      chart.legend({ container });

      expect(container.childNodes.length).toBe(1);
    });
  });

  describe('tooltip(handlerFn)', () => {
    it('defaults to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.tooltip()).toBeNull();
    });

    it('sets and returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const handler = (d) => d.label;
      expect(chart.tooltip(handler)).toBe(chart);
      expect(chart.tooltip()).toBe(handler);
    });

    it('throws if given a non-function', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.tooltip('nope')).toThrow(TypeError);
    });
  });

  describe('setAriaLabel(label, options) / setLongDescription(text, options) (Prompt 180)', () => {
    function makeContainer() {
      const parent = document.createElement('div');
      const container = document.createElement('canvas');
      parent.appendChild(container);
      return container;
    }

    it('throws TypeError for a non-string label', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.setAriaLabel(42, { container: makeContainer() })).toThrow(TypeError);
      expect(() => chart.setAriaLabel('', { container: makeContainer() })).toThrow(TypeError);
    });

    it('throws TypeError for a non-string description', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.setLongDescription(42, { container: makeContainer() })).toThrow(TypeError);
    });

    it('throws TypeError when no container is available yet', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.setAriaLabel('Revenue')).toThrow(TypeError);
    });

    it('creates a hidden div right after container, containing the label', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const container = makeContainer();

      expect(chart.setAriaLabel('Revenue by quarter', { container })).toBe(chart);

      const div = container.nextSibling;
      expect(div).not.toBeNull();
      expect(div.textContent).toContain('Revenue by quarter');
      expect(div.style.position).toBe('absolute'); // visually-hidden, not display:none
    });

    it('setLongDescription() reuses the div setAriaLabel() already created, without a container', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const container = makeContainer();
      chart.setAriaLabel('Revenue by quarter', { container });

      chart.setLongDescription('Steady growth each quarter.');

      const div = container.nextSibling;
      expect(div.textContent).toBe('Revenue by quarter. Steady growth each quarter.');
    });

    it('auto-generates the description from data when setLongDescription() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      const container = makeContainer();
      chart.setAriaLabel('Revenue', { container });
      chart.data([10, 20, 30]);

      chart.render();

      const div = container.nextSibling;
      expect(div.textContent).toBe('Revenue. 3 data points, values ranging from 10 to 30.');
    });

    it('an explicit setLongDescription() overrides the auto-generated one across render()/update()', () => {
      // Same-length replacement data (positional join) — a shorter array
      // would also trigger a real exit, which schedules a SelectionTransition
      // against the shared anim/loop singletons (see the update() describe
      // block's own note above) — out of scope for what this test checks.
      const chart = new GraphChart(makeScene(), generator.bar());
      const container = makeContainer();
      chart.setAriaLabel('Revenue', { container });
      chart.setLongDescription('A fixed summary.');
      chart.data([10, 20, 30]);
      chart.render();

      chart.data([1, 2, 3]);
      chart.update();

      const div = container.nextSibling;
      expect(div.textContent).toBe('Revenue. A fixed summary.');
    });

    it('the auto-generated description refreshes on update() when no explicit description is set', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      const container = makeContainer();
      chart.data([10, 20, 30]);
      chart.render();
      chart.setAriaLabel('Revenue', { container });

      chart.data([1, 2, 3]);
      chart.update();

      const div = container.nextSibling;
      expect(div.textContent).toBe('Revenue. 3 data points, values ranging from 1 to 3.');
    });

    it('removes the hidden div on destroy()', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      const container = makeContainer();
      const parent = container.parentElement;
      chart.data([1, 2]);
      chart.render();
      chart.setAriaLabel('Revenue', { container });

      chart.destroy();

      expect(parent.children.length).toBe(1); // only the container remains
    });
  });

  describe('hoverEffect(presetName, options) / selectEffect(presetName, options)', () => {
    it('default to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.hoverEffect()).toBeNull();
      expect(chart.selectEffect()).toBeNull();
    });

    it('set and return this for chaining, reading back { name, options }', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.hoverEffect('fire', { intensity: 1.2 })).toBe(chart);
      expect(chart.hoverEffect()).toEqual({ name: 'fire', options: { intensity: 1.2 } });

      expect(chart.selectEffect('glow', { color: '#22ffcc' })).toBe(chart);
      expect(chart.selectEffect()).toEqual({ name: 'glow', options: { color: '#22ffcc' } });
    });

    it('options defaults to {} when omitted', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.hoverEffect('pulse');
      expect(chart.hoverEffect()).toEqual({ name: 'pulse', options: {} });
    });

    it('throws with a "did you mean" suggestion for an unregistered preset name', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.hoverEffect('galow')).toThrow(/did you mean 'glow'/i);
      expect(() => chart.selectEffect('nonexistent-effect')).toThrow(/Unknown effect/);
    });

    it('throws TypeError if options is given and is not a plain object', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.hoverEffect('glow', 'nope')).toThrow(TypeError);
      expect(() => chart.selectEffect('glow', 42)).toThrow(TypeError);
    });
  });

  describe('filter(predicateFn) / sort(compareFn)', () => {
    it('default to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.filter()).toBeNull();
      expect(chart.sort()).toBeNull();
    });

    it('set and return this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const predicate = (d) => d.value > 0;
      const compare = (a, b) => a.value - b.value;
      expect(chart.filter(predicate)).toBe(chart);
      expect(chart.filter()).toBe(predicate);
      expect(chart.sort(compare)).toBe(chart);
      expect(chart.sort()).toBe(compare);
    });

    it('throw if given a non-function', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.filter('nope')).toThrow(TypeError);
      expect(() => chart.sort('nope')).toThrow(TypeError);
    });
  });

  describe('use(middlewareFn)', () => {
    it('returns this for chaining, and throws for a non-function', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.use((data) => data)).toBe(chart);
      expect(() => chart.use('nope')).toThrow(TypeError);
    });

    it('runs registered middleware in order, between filter() and sort()', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3, 4, 5]);
      chart
        .filter((d) => d > 1)
        .use((data) => data.map((d) => d * 10))
        .use((data) => data.filter((d) => d !== 30))
        .sort((a, b) => b - a);

      chart.render();

      expect(chart.selection().data()).toEqual([50, 40, 20]);
    });
  });

  describe('transition(durationMs, easingNameOrFn)', () => {
    it('defaults to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.transition()).toBeNull();
    });

    it('sets duration with default linear easing, returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.transition(800)).toBe(chart);
      expect(chart.transition()).toEqual({ durationMs: 800, easing: 'linear' });
    });

    it('accepts a named easing curve', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.transition(400, 'easeOutCubic');
      expect(chart.transition()).toEqual({ durationMs: 400, easing: 'easeOutCubic' });
    });

    it('throws for a negative or non-number duration', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.transition(-1)).toThrow(TypeError);
      expect(() => chart.transition('nope')).toThrow(TypeError);
    });

    it('throws for an unresolvable easing name', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.transition(400, 'notARealEasing')).toThrow();
    });
  });

  describe('exitAnimation(name, options) (Prompt 122)', () => {
    function makeSystem() {
      return { preset: vi.fn() };
    }

    it('defaults to null', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.exitAnimation()).toBeNull();
    });

    it('sets name/options, returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const system = makeSystem();
      expect(chart.exitAnimation('dissolve', { system })).toBe(chart);
      expect(chart.exitAnimation()).toEqual({ name: 'dissolve', options: { system } });
    });

    it('throws for a non-string or empty name', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const system = makeSystem();
      expect(() => chart.exitAnimation(42, { system })).toThrow(TypeError);
      expect(() => chart.exitAnimation('', { system })).toThrow(TypeError);
    });

    it('throws when options.system is missing or lacks preset()', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.exitAnimation('dissolve')).toThrow(TypeError);
      expect(() => chart.exitAnimation('dissolve', { system: {} })).toThrow(TypeError);
    });
  });

  describe('draggable(value)', () => {
    it('defaults to false', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.draggable()).toBe(false);
    });

    it('sets the value, returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.draggable(true)).toBe(chart);
      expect(chart.draggable()).toBe(true);
    });

    it('throws for a non-boolean value', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.draggable('yes')).toThrow(TypeError);
    });
  });

  describe('data() dev warning (Prompt 179): setData before attach', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns on the next microtask when render() never follows data()', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      new GraphChart(makeScene(), generator.bar()).data([1, 2]);

      await Promise.resolve();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('render() was never called'));
    });

    it('does not warn for the ordinary data(rows); render() idiom (still synchronous)', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();

      await Promise.resolve();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn if the chart was destroyed before the microtask fires', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.destroy();

      await Promise.resolve();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('pickingEnabled(value) (Prompt 156)', () => {
    it('defaults to true', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.pickingEnabled()).toBe(true);
    });

    it('sets the value, returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.pickingEnabled(false)).toBe(chart);
      expect(chart.pickingEnabled()).toBe(false);
    });

    it('throws for a non-boolean value', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.pickingEnabled('nope')).toThrow(TypeError);
    });
  });

  describe('exportSelection(selectedData) / importSelection(keys) (Prompt 155)', () => {
    it('exports the keyFn-derived key for each selected datum', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }];
      chart.data(rows, (d) => d.id);

      expect(chart.exportSelection([rows[0], rows[2]])).toEqual(['a', 'c']);
    });

    it('falls back to the datum itself as its own key when no keyFn was given', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 'a' }, { id: 'b' }];
      chart.data(rows);

      expect(chart.exportSelection([rows[1]])).toEqual([rows[1]]);
    });

    it('importSelection resolves keys back to the current data() entries', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }];
      chart.data(rows, (d) => d.id);

      expect(chart.importSelection(['a', 'c'])).toEqual([rows[0], rows[2]]);
    });

    it('round-trips a selection through a data() reload with new object instances', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
      chart.data(rows, (d) => d.id);
      const keys = chart.exportSelection([rows[1]]);

      // Fresh object instances, same ids — the object-identity-based
      // selection this survives is exactly why exportSelection()/
      // importSelection() exist (see GraphChart.js's doc comment).
      const reloadedRows = [{ id: 'a', value: 10 }, { id: 'b', value: 20 }];
      chart.data(reloadedRows, (d) => d.id);

      expect(chart.importSelection(keys)).toEqual([reloadedRows[1]]);
    });

    it('importSelection ignores keys with no current match', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const rows = [{ id: 'a' }];
      chart.data(rows, (d) => d.id);

      expect(chart.importSelection(['a', 'nonexistent'])).toEqual([rows[0]]);
    });

    it('exportSelection throws for a non-array argument', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.data([{ id: 'a' }], (d) => d.id);
      expect(() => chart.exportSelection('nope')).toThrow(TypeError);
    });

    it('importSelection throws for a non-array argument', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.data([{ id: 'a' }], (d) => d.id);
      expect(() => chart.importSelection('nope')).toThrow(TypeError);
    });

    it('both throw a clear error when data() was never called', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.exportSelection([])).toThrow(/data\(arr\)/);
      expect(() => chart.importSelection([])).toThrow(/data\(arr\)/);
    });
  });

  describe('exportPNG(options) / exportSVG(options) (Prompt 181)', () => {
    it('exportPNG renders the chart scene through the given renderer/camera and returns a PNG data URL', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, makeGenerator());
      const renderer = makeMockRenderer();
      const camera = new THREE.PerspectiveCamera();

      const dataUrl = chart.exportPNG({ renderer, camera });

      expect(renderer.render).toHaveBeenCalledWith(scene, camera);
      expect(renderer.domElement.toDataURL).toHaveBeenCalledWith('image/png');
      expect(dataUrl).toBe('data:image/png;base64,MOCK');
    });

    it('exportPNG throws TypeError when renderer is missing or not a WebGLRenderer', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const camera = new THREE.PerspectiveCamera();
      expect(() => chart.exportPNG({ camera })).toThrow(TypeError);
      expect(() => chart.exportPNG({ renderer: {}, camera })).toThrow(TypeError);
    });

    it('exportPNG throws TypeError when camera is missing', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.exportPNG({ renderer: makeMockRenderer() })).toThrow(TypeError);
    });

    it('exportSVG renders through SVGRenderer and resolves with serialized SVG markup', async () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const camera = new THREE.PerspectiveCamera();

      const svg = await chart.exportSVG({ camera, width: 400, height: 300 });

      expect(svg).toContain('<svg');
      expect(svg).toContain('width="400"');
      expect(svg).toContain('height="300"');
    });

    it('exportSVG rejects with TypeError when camera is missing', async () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      await expect(chart.exportSVG({ width: 100, height: 100 })).rejects.toThrow(TypeError);
    });

    it('exportSVG rejects with TypeError for non-positive width/height', async () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const camera = new THREE.PerspectiveCamera();
      await expect(chart.exportSVG({ camera, width: 0, height: 100 })).rejects.toThrow(TypeError);
      await expect(chart.exportSVG({ camera, width: 100, height: -5 })).rejects.toThrow(TypeError);
    });
  });

  describe('on(event, handler) / handlers()', () => {
    it('starts with empty handler lists for enter/update/exit', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.handlers()).toEqual({ enter: [], update: [], exit: [] });
    });

    it('registers a handler under its event and returns this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const handler = vi.fn();
      expect(chart.on('exit', handler)).toBe(chart);
      expect(chart.handlers().exit).toEqual([handler]);
    });

    it('throws for an unrecognized event', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.on('click', vi.fn())).toThrow(TypeError);
    });

    it('throws if handler is not a function', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.on('enter', 'nope')).toThrow(TypeError);
    });
  });

  describe('on(event, handler) / dispatch(event, payload) — interaction events (Prompt 156)', () => {
    const INTERACTION_EVENTS = ['hover', 'select', 'deselect', 'brushStart', 'brushEnd', 'lassoStart', 'lassoEnd', 'dragStart', 'dragEnd', 'focus'];

    it.each(INTERACTION_EVENTS)('registers and dispatches a handler for %s, returning this both times', (event) => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const handler = vi.fn();
      const payload = { some: 'payload' };
      expect(chart.on(event, handler)).toBe(chart);
      expect(chart.dispatch(event, payload)).toBe(chart);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('calls multiple handlers for the same event in registration order', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const calls = [];
      chart.on('select', () => calls.push('first'));
      chart.on('select', () => calls.push('second'));
      chart.dispatch('select', {});
      expect(calls).toEqual(['first', 'second']);
    });

    it('does not cross-fire between different interaction events', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const selectHandler = vi.fn();
      const deselectHandler = vi.fn();
      chart.on('select', selectHandler).on('deselect', deselectHandler);
      chart.dispatch('select', {});
      expect(selectHandler).toHaveBeenCalledOnce();
      expect(deselectHandler).not.toHaveBeenCalled();
    });

    it('dispatch is a no-op (no throw) when no handler is registered', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.dispatch('hover', {})).not.toThrow();
    });

    it('dispatch throws TypeError for a lifecycle event — enter/update/exit only dispatch via update()', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.dispatch('enter', {})).toThrow(TypeError);
      expect(() => chart.dispatch('update', {})).toThrow(TypeError);
      expect(() => chart.dispatch('exit', {})).toThrow(TypeError);
    });

    it('dispatch throws TypeError for an unrecognized event', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(() => chart.dispatch('click', {})).toThrow(TypeError);
    });

    it("interaction handlers don't appear in handlers()'s lifecycle-only shape", () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      chart.on('select', vi.fn());
      expect(chart.handlers()).toEqual({ enter: [], update: [], exit: [] });
    });
  });

  describe('onEnter/onUpdate/onExit(fn) — sugar for on() (Prompt 128)', () => {
    it('register a handler under the matching event and return this for chaining', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      const enterFn = vi.fn();
      const updateFn = vi.fn();
      const exitFn = vi.fn();
      expect(chart.onEnter(enterFn)).toBe(chart);
      expect(chart.onUpdate(updateFn)).toBe(chart);
      expect(chart.onExit(exitFn)).toBe(chart);
      expect(chart.handlers()).toEqual({ enter: [enterFn], update: [updateFn], exit: [exitFn] });
    });
  });

  describe('selection() (Prompt 128)', () => {
    it('returns an empty live Selection before any render()', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.selection()).toBeInstanceOf(Selection);
      expect(chart.selection().size()).toBe(0);
    });

    it('is the same backend data() joins against', () => {
      const chart = new GraphChart(makeScene(), makeGenerator());
      expect(chart.data()).toEqual(chart.selection().data());
    });
  });

  describe('render() (Prompt 129)', () => {
    it('throws if data() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.render()).toThrow(Error);
    });

    it('materializes a small dataset into a GraphMesh[] backend (below INSTANCING_THRESHOLD)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([3, 5, 2]);

      expect(chart.render()).toBe(chart);

      const selection = chart.selection();
      expect(selection.size()).toBe(3);
      expect(selection.data()).toEqual([3, 5, 2]);

      const mesh = scene.children[0];
      expect(mesh.position.toArray()).toEqual([0, 1.5, 0]);
      expect(mesh.scale.toArray()).toEqual([Math.fround(0.8), 3, Math.fround(0.8)]);
    });

    it('materializes a large dataset into a GraphInstancedObject backend (at/above INSTANCING_THRESHOLD)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      const rows = Array.from({ length: 60 }, (_, i) => i);
      chart.data(rows);

      chart.render();

      expect(chart.selection().size()).toBe(60);
      expect(chart.selection().data()).toEqual(rows);
      expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);
    });

    it('fits a continuous scale domain to the data via its accessor', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      const ys = scale.linear().range([0, 10]);
      chart.data([{ value: 3 }, { value: 9 }, { value: -2 }]);
      chart.y((d) => d.value, ys);

      chart.render();

      expect(ys.domain()).toEqual([-2, 9]);
    });

    it('fits an ordinal/band scale domain to the data via its accessor', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      const xs = scale.band().range([0, 10]);
      chart.data([
        { label: 'a', value: 1 },
        { label: 'b', value: 2 },
        { label: 'a', value: 3 },
      ]);
      chart.x((d) => d.label, xs).y((d) => d.value);

      chart.render();

      expect(xs.domain()).toEqual(['a', 'b']);
    });

    it('applies the configured material preset', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.material('standard', { color: '#ff0000' });

      chart.render();

      expect(scene.children[0].material.color.getHexString()).toBe('ff0000');
    });

    it('defaults to material.standard() when no material is configured', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);

      chart.render();

      expect(scene.children[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });

    it('applies filter() and sort() before materializing', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([5, 1, 3, -1]);
      chart.filter((d) => d > 0).sort((a, b) => a - b);

      chart.render();

      expect(chart.selection().data()).toEqual([1, 3, 5]);
    });

    it('picks a sphere-geometry backend for a shape-tagged generator (generator.point())', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.point());
      chart.data([1, 2]);

      chart.render();

      expect(scene.children[0].geometry).toBeInstanceOf(THREE.SphereGeometry);
    });

    it('a second render() call routes to update(), which re-joins the same data with no changes', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();

      expect(chart.render()).toBe(chart);
      expect(chart.selection().data()).toEqual([1, 2, 3]);
    });
  });

  describe('update() (Prompt 130)', () => {
    // update()'s default exit path always schedules a SelectionTransition
    // (dissolve) even when no chart-level .transition() is configured —
    // SelectionTransition drives itself off the shared anim/loop singletons,
    // so RAF must be mocked (mirrors tests/compose/selection/SelectionTransition.test.js).
    let rafCallback = null;
    let rafIdCounter = 1;

    function tick(now) {
      expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
      const cb = rafCallback;
      rafCallback = null;
      cb(now);
    }

    beforeEach(() => {
      rafCallback = null;
      rafIdCounter = 1;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb) => {
          rafCallback = cb;
          return rafIdCounter++;
        }),
      );
      vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('throws if render() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.update()).toThrow(Error);
    });

    it('joins new data and snaps surviving members to recomputed positions (no transition configured)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();

      chart.data([10, 20, 30]);
      chart.update();

      expect(chart.selection().data()).toEqual([10, 20, 30]);
      // bar(): position.y = (value + baseline) / 2, baseline defaults to 0.
      expect(scene.children[0].position.y).toBeCloseTo(5);
      expect(scene.children[1].position.y).toBeCloseTo(10);
      expect(scene.children[2].position.y).toBeCloseTo(15);
    });

    it('materializes newly-entering members with computed position/scale (meshes backend, via the render()-attached template)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2]);
      chart.render();
      expect(scene.children.length).toBe(2);

      chart.data([1, 2, 9]);
      chart.update();

      expect(chart.selection().size()).toBe(3);
      expect(chart.selection().data()).toEqual([1, 2, 9]);
      expect(scene.children.length).toBe(3);
      expect(scene.children[2].position.y).toBeCloseTo(4.5);
    });

    it('removes exiting members by default after a dissolve transition completes', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();
      const departing = scene.children[2];

      chart.data([1, 2]);
      chart.update();

      expect(chart.selection().size()).toBe(2);
      tick(0);
      tick(100); // < SelectionTransition's default 250ms duration
      expect(() => departing.position).not.toThrow();
      tick(400); // >= 250ms — dissolve transition completes, member removed
      expect(scene.children.includes(departing)).toBe(false);
    });

    it('removes exiting members immediately via the configured exitAnimation, instead of the dissolve transition', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();
      const departing = scene.children[2];
      const system = { preset: vi.fn() };
      chart.exitAnimation('dissolve', { system });

      chart.data([1, 2]);
      chart.update();

      // No RAF tick needed — removal (and the particle burst) happen synchronously.
      expect(chart.selection().size()).toBe(2);
      expect(scene.children.includes(departing)).toBe(false);
      expect(system.preset).toHaveBeenCalledTimes(1);
      expect(system.preset).toHaveBeenCalledWith('dissolve', { mesh: departing });
    });

    it('calls registered onUpdate/onEnter handlers instead of the default write, when set', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2]);
      chart.render();

      const onUpdate = vi.fn();
      const onEnter = vi.fn();
      chart.onUpdate(onUpdate).onEnter(onEnter);
      chart.data([1, 2, 3]);
      chart.update();

      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onEnter).toHaveBeenCalledTimes(1);
      const [updateSelection] = onUpdate.mock.calls[0];
      expect(updateSelection.size()).toBe(2);
      const [enterSelection] = onEnter.mock.calls[0];
      expect(enterSelection.size()).toBe(1);
    });

    it('calls registered onExit handlers instead of the default dissolve, when set', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();

      const onExit = vi.fn();
      chart.onExit(onExit);
      chart.data([1, 2]);
      chart.update();

      expect(onExit).toHaveBeenCalledTimes(1);
      expect(onExit.mock.calls[0][0].size()).toBe(1);
      // Scene still has all 3 — the user's handler owns removal, and this
      // handler didn't call .remove() itself.
      expect(scene.children.length).toBe(3);
    });

    it('animates the update group toward recomputed positions when a transition is configured', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([0, 0]);
      chart.render();

      chart.transition(1000, 'linear');
      chart.data([10, 20]);
      chart.update();

      tick(0);
      tick(500); // halfway through the 1000ms transition
      expect(scene.children[0].position.y).toBeCloseTo(2.5);
      tick(1000);
      expect(scene.children[0].position.y).toBeCloseTo(5);
    });
  });

  describe('stream(dataStream) (Prompt 161)', () => {
    // A minimal push-based async-iterable, mirroring stream/DataStream.js's
    // fromWebSocket() shape closely enough to exercise stream()'s pump loop:
    // push() resolves an already-waiting next() immediately, or buffers.
    function makePushStream() {
      const waiters = [];
      const buffered = [];
      return {
        push(chunk) {
          if (waiters.length > 0) waiters.shift()({ value: chunk, done: false });
          else buffered.push(chunk);
        },
        dispose: vi.fn(),
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              if (buffered.length > 0) return Promise.resolve({ value: buffered.shift(), done: false });
              return new Promise((resolve) => waiters.push(resolve));
            },
          };
        },
      };
    }

    async function flush(hops = 20) {
      for (let i = 0; i < hops; i++) await Promise.resolve();
    }

    beforeEach(() => {
      vi.useFakeTimers();
      // A stream-driven update() can trigger the default dissolve transition
      // (removed entries), which schedules onto the shared anim/loop
      // singleton via requestAnimationFrame — stub it (never ticked here) so
      // that registration doesn't leak a real RAF callback past this test
      // into later describe blocks (mirrors update()'s own RAF stub above).
      vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('throws TypeError for a non-async-iterable dataStream', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.stream(null)).toThrow(TypeError);
      expect(() => chart.stream({})).toThrow(TypeError);
    });

    it('throws if render() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.stream(makePushStream())).toThrow(Error);
    });

    it('applies an added chunk through the same data()+update() path as a manual call', async () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.y((d) => d.value);
      chart.data([{ id: 1, value: 1 }], (d) => d.id);
      chart.render();

      const source = makePushStream();
      chart.stream(source);
      source.push({ added: [{ id: 2, value: 2 }], updated: [], removed: [] });
      await flush();

      expect(chart.data()).toEqual([{ id: 1, value: 1 }, { id: 2, value: 2 }]);
      expect(scene.children.length).toBe(2);
    });

    it('applies updated and removed chunks, keyed the same way as data(arr, keyFn)', async () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.y((d) => d.value);
      chart.data([{ id: 1, value: 1 }, { id: 2, value: 2 }], (d) => d.id);
      chart.render();

      const source = makePushStream();
      chart.stream(source);
      source.push({ added: [], updated: [{ id: 1, value: 100 }], removed: [{ id: 2 }] });
      await flush();

      // The removed member's default dissolve transition needs a RAF tick to
      // finish (covered by update()'s own tests above) — only the join
      // result itself is this test's concern.
      expect(chart.data()).toEqual([{ id: 1, value: 100 }]);
      // destroy() stops that still-pending dissolve transition, so it
      // doesn't leak a real RAF registration against the shared anim/loop
      // singleton into a later test file's describe block.
      chart.destroy();
    });

    it('replacing the binding with a second stream() call disposes the first dataStream', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.y((d) => d.value);
      chart.data([{ id: 0, value: 0 }], (d) => d.id);
      chart.render();

      const first = makePushStream();
      const second = makePushStream();
      chart.stream(first);
      chart.stream(second);

      expect(first.dispose).toHaveBeenCalledTimes(1);
    });

    it('destroy() disposes the active dataStream', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.y((d) => d.value);
      chart.data([{ id: 0, value: 0 }], (d) => d.id);
      chart.render();

      const source = makePushStream();
      chart.stream(source);
      chart.destroy();

      expect(source.dispose).toHaveBeenCalledTimes(1);
    });

    it('backpressure: a burst of chunks that arrive faster than they can be applied only applies the latest', async () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.y((d) => d.value);
      chart.data([{ id: 1, value: 1 }], (d) => d.id);
      chart.render();

      const source = makePushStream();
      chart.stream(source);

      // Chunk 2 fully applies and parks on its post-apply macrotask yield.
      source.push({ added: [{ id: 2, value: 2 }], updated: [], removed: [] });
      await flush();
      expect(chart.data().map((d) => d.id)).toEqual([1, 2]);

      // Chunks 3/4/5 arrive back-to-back while the applier is parked — the
      // pump loop drains all three into the single pending slot, each
      // overwriting the last, before the applier ever wakes up to look.
      source.push({ added: [{ id: 3, value: 3 }], updated: [], removed: [] });
      source.push({ added: [{ id: 4, value: 4 }], updated: [], removed: [] });
      source.push({ added: [{ id: 5, value: 5 }], updated: [], removed: [] });
      await flush();

      await vi.advanceTimersByTimeAsync(0); // wakes the parked applier
      await flush();
      await vi.advanceTimersByTimeAsync(0); // its own post-apply yield settles
      await flush();

      const ids = chart.data().map((d) => d.id);
      expect(ids).toEqual([1, 2, 5]); // only the latest of the dropped burst survived
    });
  });

  describe('enableLOD(options) / disableLOD() (Prompt 163)', () => {
    let rafCallback = null;
    let rafIdCounter = 1;

    function tick(now = 0) {
      expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
      const cb = rafCallback;
      rafCallback = null;
      cb(now);
    }

    function makeCamera(initialDistance) {
      let distance = initialDistance;
      return {
        position: { distanceTo: () => distance },
        setDistance: (d) => {
          distance = d;
        },
      };
    }

    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, value: i }));

    beforeEach(() => {
      rafCallback = null;
      rafIdCounter = 1;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb) => {
          rafCallback = cb;
          return rafIdCounter++;
        }),
      );
      vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('throws TypeError for an invalid levels array or a camera without position.distanceTo', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();
      expect(() => chart.enableLOD({ levels: [], camera: makeCamera(5) })).toThrow(TypeError);
      expect(() => chart.enableLOD({ levels: [{ maxDistance: 10, maxPoints: 3 }], camera: {} })).toThrow(TypeError);
      chart.destroy();
    });

    it('throws if render() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.enableLOD({ levels: [{ maxDistance: 10, maxPoints: 3 }], camera: makeCamera(5) })).toThrow(Error);
    });

    it('applies the initial level immediately, decimating the currently bound data', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();

      chart.enableLOD({
        camera: makeCamera(5),
        levels: [{ maxDistance: 10, maxPoints: 3 }],
      });

      expect(chart.data()).toHaveLength(3);
      chart.destroy();
    });

    it('re-decimates and calls update() when a camera-distance change crosses into a farther level', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();
      const camera = makeCamera(5);

      chart.enableLOD({
        camera,
        levels: [
          { maxDistance: 10, maxPoints: 10 },
          { maxDistance: 100, maxPoints: 3 },
        ],
      });
      expect(chart.data()).toHaveLength(10);

      camera.setDistance(50);
      tick();

      expect(chart.data()).toHaveLength(3);
      chart.destroy();
    });

    it('is a no-op (no re-join) when the camera stays within the same level bucket', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();
      const camera = makeCamera(5);

      chart.enableLOD({
        camera,
        levels: [
          { maxDistance: 10, maxPoints: 10 },
          { maxDistance: 100, maxPoints: 3 },
        ],
      });
      const updateSpy = vi.spyOn(chart, 'update');

      camera.setDistance(6); // still within the first (10) bucket
      tick();

      expect(updateSpy).not.toHaveBeenCalled();
      chart.destroy();
    });

    it('disableLOD() stops the per-frame check', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();
      const camera = makeCamera(5);

      chart.enableLOD({
        camera,
        levels: [
          { maxDistance: 10, maxPoints: 10 },
          { maxDistance: 100, maxPoints: 3 },
        ],
      });
      chart.disableLOD();

      camera.setDistance(50);
      expect(rafCallback).toBeNull(); // nothing left to tick — the callback was unregistered
      expect(chart.data()).toHaveLength(10);
      chart.destroy();
    });

    it('destroy() also stops the per-frame check', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();
      chart.enableLOD({ camera: makeCamera(5), levels: [{ maxDistance: 10, maxPoints: 3 }] });

      chart.destroy();

      expect(rafCallback).toBeNull();
    });

    it('calling enableLOD() again re-snapshots the full dataset from the current bind', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data(rows, (d) => d.id);
      chart.y((d) => d.value);
      chart.render();

      chart.enableLOD({ camera: makeCamera(5), levels: [{ maxDistance: 10, maxPoints: 3 }] });
      expect(chart.data()).toHaveLength(3);

      const moreRows = Array.from({ length: 20 }, (_, i) => ({ id: i, value: i }));
      chart.data(moreRows, (d) => d.id);
      chart.update();
      chart.enableLOD({ camera: makeCamera(5), levels: [{ maxDistance: 10, maxPoints: 5 }] });

      expect(chart.data()).toHaveLength(5);
      chart.destroy();
    });
  });

  describe('compact() (Prompt 168)', () => {
    it('throws if render() was never called', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.compact()).toThrow(Error);
    });

    it('is a no-op when the backend is already instanced (at/above INSTANCING_THRESHOLD)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      const rows = Array.from({ length: 60 }, (_, i) => i);
      chart.data(rows);
      chart.render();
      const instancedMesh = scene.children[0];

      expect(chart.compact()).toBe(chart);

      expect(scene.children[0]).toBe(instancedMesh);
      expect(scene.children.length).toBe(1);
    });

    it('merges a GraphMesh[] backend into a single GraphInstancedObject, preserving live position/scale', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([3, 5, 2]);
      chart.render();
      const meshes = scene.children.slice();
      const livePositions = meshes.map((m) => m.position.toArray());
      const liveScales = meshes.map((m) => m.scale.toArray());

      expect(chart.compact()).toBe(chart);

      expect(scene.children.length).toBe(1);
      expect(scene.children[0]).toBeInstanceOf(THREE.InstancedMesh);
      const merged = scene.children[0];
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scaleOut = new THREE.Vector3();
      for (let i = 0; i < 3; i++) {
        merged.getMatrixAt(i, matrix);
        matrix.decompose(position, quaternion, scaleOut);
        expect(position.toArray()).toEqual(livePositions[i]);
        expect(scaleOut.toArray().map((v) => Math.fround(v))).toEqual(liveScales[i].map((v) => Math.fround(v)));
      }
    });

    it('preserves each mesh\'s live (possibly handler-overridden) color via instanceColor', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([3, 5, 2]);
      chart.render();
      chart.selection().attr('color', (d, i) => (i === 1 ? '#00ff00' : '#ff0000'));

      chart.compact();

      const merged = scene.children[0];
      expect(merged.instanceColor).not.toBeNull();
      const readBack = (i) => new THREE.Color().fromBufferAttribute(merged.instanceColor, i);
      expect(readBack(0).getHexString()).toBe('ff0000');
      expect(readBack(1).getHexString()).toBe('00ff00');
      expect(readBack(2).getHexString()).toBe('ff0000');
    });

    it('preserves selection().data() and disposes the original meshes', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([3, 5, 2], (d) => d);
      chart.render();
      const originalMeshes = scene.children.slice();

      chart.compact();

      expect(chart.selection().data()).toEqual([3, 5, 2]);
      expect(chart.selection().size()).toBe(3);
      for (const mesh of originalMeshes) {
        expect(scene.children.includes(mesh)).toBe(false);
      }
    });

    it('is irreversible — a second compact() call is a no-op on the now-instanced backend', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2]);
      chart.render();

      chart.compact();
      const merged = scene.children[0];
      chart.compact();

      expect(scene.children[0]).toBe(merged);
      expect(scene.children.length).toBe(1);
    });
  });

  describe('window(size) (Prompt 168)', () => {
    let rafCallback = null;
    let rafIdCounter = 1;

    function tick(now) {
      expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
      const cb = rafCallback;
      rafCallback = null;
      cb(now);
    }

    beforeEach(() => {
      rafCallback = null;
      rafIdCounter = 1;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb) => {
          rafCallback = cb;
          return rafIdCounter++;
        }),
      );
      vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('getter form returns null when unset, and the configured size once set', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(chart.window()).toBeNull();
      expect(chart.window(5)).toBe(chart);
      expect(chart.window()).toBe(5);
    });

    it('throws TypeError for a non-positive-integer size', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.window(0)).toThrow(TypeError);
      expect(() => chart.window(-1)).toThrow(TypeError);
      expect(() => chart.window(1.5)).toThrow(TypeError);
      expect(() => chart.window('5')).toThrow(TypeError);
    });

    it('caps the initial render() to the last size entries', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.window(2);
      chart.data([1, 2, 3, 4, 5], (d) => d);

      chart.render();

      expect(chart.selection().data()).toEqual([4, 5]);
    });

    it('trims oldest entries past the cap on update(), dissolving them out via the normal exit path', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.window(3);
      chart.data([1, 2, 3], (d) => d);
      chart.render();
      expect(scene.children.length).toBe(3);

      chart.data([1, 2, 3, 4], (d) => d); // pushes past the cap of 3 — "1" should be trimmed
      chart.update();

      expect(chart.selection().data()).toEqual([2, 3, 4]);
      tick(0);
      tick(400); // dissolve transition completes (default duration 250ms)
      expect(scene.children.length).toBe(3);
    });

    it('a registered onExit handler still fires for window-trimmed entries (same exit path as any other exit)', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.window(2);
      chart.data([1, 2], (d) => d);
      chart.render();

      const onExit = vi.fn();
      chart.onExit(onExit);
      chart.data([1, 2, 3], (d) => d);
      chart.update();

      expect(onExit).toHaveBeenCalledTimes(1);
      expect(chart.selection().data()).toEqual([2, 3]);
    });

    it('is a no-op when data length stays within the cap', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.window(10);
      chart.data([1, 2, 3], (d) => d);

      chart.render();

      expect(chart.selection().data()).toEqual([1, 2, 3]);
    });
  });

  describe('destroy() (Prompt 131)', () => {
    let rafCallback = null;
    let rafIdCounter = 1;

    function tick(now) {
      expect(rafCallback, 'tick() called but no RAF was scheduled').not.toBeNull();
      const cb = rafCallback;
      rafCallback = null;
      cb(now);
    }

    beforeEach(() => {
      rafCallback = null;
      rafIdCounter = 1;
      vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn((cb) => {
          rafCallback = cb;
          return rafIdCounter++;
        }),
      );
      vi.stubGlobal('cancelAnimationFrame', vi.fn(() => { rafCallback = null; }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('is idempotent — calling twice does not throw', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();
      expect(() => {
        chart.destroy();
        chart.destroy();
      }).not.toThrow();
    });

    it('Prompt 179: warns (does not throw) when destroy() is called a second time', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();
      chart.destroy();
      warnSpy.mockClear();

      chart.destroy();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already been destroyed'));
    });

    it('Prompt 179: warns when destroying a chart with transitions still in flight', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2]);
      chart.transition(1000);
      chart.render();
      chart.data([3, 4]);
      chart.update(); // starts a SelectionTransition, tracked in #activeTransitions

      chart.destroy();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('transition(s) still in flight'));
    });

    it('Prompt 179: does not warn when destroying a chart with no active transitions', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();

      chart.destroy();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('clears a configured legend container', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      const container = document.createElement('div');
      chart.data([{ v: 1 }]);
      chart.y((d) => d.v);
      chart.color((d) => d.v);
      chart.legend({ container });
      chart.render();
      expect(container.childNodes.length).toBeGreaterThan(0);

      chart.destroy();

      expect(container.childNodes.length).toBe(0);
    });

    it('is safe to call before render() was ever invoked', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      expect(() => chart.destroy()).not.toThrow();
    });

    it('disposes every mesh (geometry + material) and clears the scene (meshes backend)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();
      const geometrySpies = scene.children.map((m) => vi.spyOn(m.geometry, 'dispose'));
      const materialSpies = scene.children.map((m) => vi.spyOn(m.material, 'dispose'));

      chart.destroy();

      for (const spy of geometrySpies) expect(spy).toHaveBeenCalledOnce();
      for (const spy of materialSpies) expect(spy).toHaveBeenCalledOnce();
      expect(scene.children.length).toBe(0);
    });

    it('disposes the shared instanced object and clears the scene (instanced backend)', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data(Array.from({ length: 60 }, (_, i) => i));
      chart.render();
      const instancedMesh = scene.children[0];
      const geometrySpy = vi.spyOn(instancedMesh.geometry, 'dispose');
      const materialSpy = vi.spyOn(instancedMesh.material, 'dispose');

      chart.destroy();

      expect(geometrySpy).toHaveBeenCalledOnce();
      expect(materialSpy).toHaveBeenCalledOnce();
      expect(scene.children.length).toBe(0);
    });

    it('every public method throws after destroy with a descriptive error', () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();
      chart.destroy();

      const pattern = /GraphChart\.\w+: this chart has been destroyed/;
      expect(() => chart.data([1])).toThrow(pattern);
      expect(() => chart.x((d) => d)).toThrow(pattern);
      expect(() => chart.y((d) => d)).toThrow(pattern);
      expect(() => chart.z((d) => d)).toThrow(pattern);
      expect(() => chart.color('red')).toThrow(pattern);
      expect(() => chart.size(1)).toThrow(pattern);
      expect(() => chart.shape('sphere')).toThrow(pattern);
      expect(() => chart.material('standard')).toThrow(pattern);
      expect(() => chart.legend({ container: document.createElement('div') })).toThrow(pattern);
      expect(() => chart.tooltip(() => {})).toThrow(pattern);
      expect(() => chart.setAriaLabel('label', { container: document.createElement('div') })).toThrow(pattern);
      expect(() => chart.setLongDescription('description', { container: document.createElement('div') })).toThrow(pattern);
      expect(() => chart.hoverEffect('glow')).toThrow(pattern);
      expect(() => chart.selectEffect('glow')).toThrow(pattern);
      expect(() => chart.filter(() => true)).toThrow(pattern);
      expect(() => chart.sort(() => 0)).toThrow(pattern);
      expect(() => chart.use((data) => data)).toThrow(pattern);
      expect(() => chart.transition(100)).toThrow(pattern);
      expect(() => chart.draggable(true)).toThrow(pattern);
      expect(() => chart.pickingEnabled(true)).toThrow(pattern);
      expect(() => chart.dispatch('select', {})).toThrow(pattern);
      expect(() => chart.on('enter', () => {})).toThrow(pattern);
      expect(() => chart.onEnter(() => {})).toThrow(pattern);
      expect(() => chart.onUpdate(() => {})).toThrow(pattern);
      expect(() => chart.onExit(() => {})).toThrow(pattern);
      expect(() => chart.handlers()).toThrow(pattern);
      expect(() => chart.selection()).toThrow(pattern);
      expect(() => chart.render()).toThrow(pattern);
      expect(() => chart.update()).toThrow(pattern);
      expect(() => chart.stream(null)).toThrow(pattern);
      expect(() => chart.exportSelection([])).toThrow(pattern);
      expect(() => chart.importSelection([])).toThrow(pattern);
      expect(() => chart.exportPNG({ renderer: makeMockRenderer(), camera: {} })).toThrow(pattern);
    });

    it('exportSVG rejects after destroy with a descriptive error', async () => {
      const chart = new GraphChart(makeScene(), generator.bar());
      chart.data([1, 2]);
      chart.render();
      chart.destroy();

      await expect(chart.exportSVG({ camera: {}, width: 100, height: 100 })).rejects.toThrow(
        /GraphChart\.exportSVG: this chart has been destroyed/,
      );
    });

    it('stops an in-flight update() transition instead of letting it keep writing', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([0, 0]);
      chart.render();
      chart.transition(1000, 'linear');
      chart.data([10, 20]);
      chart.update();

      tick(0);
      tick(500); // halfway through the 1000ms transition
      const halfwayY = scene.children[0].position.y;

      expect(() => chart.destroy()).not.toThrow();

      expect(halfwayY).toBeCloseTo(2.5);
      expect(scene.children.length).toBe(0);
    });

    it('force-disposes a member still mid dissolve-out, rather than leaving it dangling', () => {
      const scene = makeScene();
      const chart = new GraphChart(scene, generator.bar());
      chart.data([1, 2, 3]);
      chart.render();
      const departing = scene.children[2];
      chart.data([1, 2]);
      chart.update();
      tick(0);
      tick(100); // < 250ms default dissolve duration — still mid-flight

      const geometrySpy = vi.spyOn(departing.geometry, 'dispose');
      const materialSpy = vi.spyOn(departing.material, 'dispose');

      chart.destroy();

      expect(geometrySpy).toHaveBeenCalledOnce();
      expect(materialSpy).toHaveBeenCalledOnce();
      expect(scene.children.includes(departing)).toBe(false);
    });
  });
});

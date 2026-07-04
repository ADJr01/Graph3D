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
      expect(() => chart.filter(() => true)).toThrow(pattern);
      expect(() => chart.sort(() => 0)).toThrow(pattern);
      expect(() => chart.transition(100)).toThrow(pattern);
      expect(() => chart.on('enter', () => {})).toThrow(pattern);
      expect(() => chart.onEnter(() => {})).toThrow(pattern);
      expect(() => chart.onUpdate(() => {})).toThrow(pattern);
      expect(() => chart.onExit(() => {})).toThrow(pattern);
      expect(() => chart.handlers()).toThrow(pattern);
      expect(() => chart.selection()).toThrow(pattern);
      expect(() => chart.render()).toThrow(pattern);
      expect(() => chart.update()).toThrow(pattern);
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

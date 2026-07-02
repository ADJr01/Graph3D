import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Axis } from '../../../src/compose/axis/Axis.js';
import { scale } from '../../../src/compose/scale/index.js';

describe('Axis chainable setters', () => {
  it('get with no args, set (chainable) with one — scale/orientation/tickCount/tickFormat/tickSize/labelStyle', () => {
    const axis = new Axis();
    const s = scale.linear().domain([0, 10]).range([0, 1]);
    const fmt = (v) => `${v}%`;
    const style = { color: 'white' };

    expect(axis.scale(s)).toBe(axis);
    expect(axis.scale()).toBe(s);

    expect(axis.orientation('y')).toBe(axis);
    expect(axis.orientation()).toBe('y');

    expect(axis.tickCount(4)).toBe(axis);
    expect(axis.tickCount()).toBe(4);

    axis.tickFormat(fmt);
    expect(axis.tickFormat()).toBe(fmt);

    expect(axis.tickSize(0.5)).toBe(axis);
    expect(axis.tickSize()).toBe(0.5);

    expect(axis.labelStyle(style)).toBe(axis);
    expect(axis.labelStyle()).toBe(style);
  });

  it('defaults: orientation x, tickCount 10, tickSize 0.2, labelStyle {}', () => {
    const axis = new Axis();
    expect(axis.orientation()).toBe('x');
    expect(axis.tickCount()).toBe(10);
    expect(axis.tickSize()).toBe(0.2);
    expect(axis.labelStyle()).toEqual({});
  });

  it('throws for invalid inputs', () => {
    const axis = new Axis();
    expect(() => axis.scale('not a function')).toThrow(TypeError);
    expect(() => axis.orientation('w')).toThrow(TypeError);
    expect(() => axis.tickCount(0)).toThrow(TypeError);
    expect(() => axis.tickCount(1.5)).toThrow(TypeError);
    expect(() => axis.tickFormat('nope')).toThrow(TypeError);
    expect(() => axis.tickSize(-1)).toThrow(TypeError);
    expect(() => axis.labelStyle(null)).toThrow(TypeError);
    expect(() => axis.labelStyle([1, 2])).toThrow(TypeError);
  });
});

describe('Axis.render', () => {
  it('throws when scale was never set', () => {
    const axis = new Axis();
    expect(() => axis.render(new THREE.Scene(), 'a')).toThrow(/call \.scale\(s\)/);
  });

  it('throws for an invalid scene or name', () => {
    const axis = new Axis().scale(scale.linear().domain([0, 10]).range([0, 10]));
    expect(() => axis.render({}, 'a')).toThrow(TypeError);
    expect(() => axis.render(new THREE.Scene(), '')).toThrow(TypeError);
  });

  it('throws when rendered twice without a dispose() in between', () => {
    const scene = new THREE.Scene();
    const axis = new Axis().scale(scale.linear().domain([0, 10]).range([0, 10]));
    axis.render(scene, 'a');
    expect(() => axis.render(scene, 'a')).toThrow(/already rendered/);
  });

  it('builds a spine line spanning the scale range, centered at the midpoint', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 100]).range([0, 10]);
    const axis = new Axis().scale(s).orientation('x').render(scene, 'x');

    const line = scene.children.find((c) => c.name === 'x_line');
    expect(line).toBeDefined();
    expect(line.position.x).toBeCloseTo(5);
    expect(line.geometry.parameters.width).toBeCloseTo(10);
  });

  it('places one tick per scale.ticks(tickCount), offset perpendicular to the spine', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 100]).range([0, 10]);
    const axis = new Axis().scale(s).orientation('x').tickCount(5).render(scene, 'x');

    const expectedTicks = s.ticks(5);
    const tickMeshes = scene.children.filter((c) => c.name.startsWith('x_tick_'));
    expect(tickMeshes.length).toBe(expectedTicks.length);

    tickMeshes.forEach((mesh, i) => {
      expect(mesh.position.x).toBeCloseTo(s(expectedTicks[i]));
      expect(mesh.position.y).toBeCloseTo(-0.1); // -tickSize/2, default tickSize 0.2
    });
  });

  it('offsets tick position by half the bandwidth for a band scale', () => {
    const scene = new THREE.Scene();
    const s = scale.band().domain(['a', 'b', 'c']).range([0, 30]);
    const axis = new Axis().scale(s).orientation('x').render(scene, 'x');

    const tickMeshes = scene.children.filter((c) => c.name.startsWith('x_tick_'));
    expect(tickMeshes.length).toBe(3);
    expect(tickMeshes[0].position.x).toBeCloseTo(s('a') + s.bandwidth() / 2);
  });

  it("orientation 'y': spine and ticks run along y, offset along x", () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 10]).range([0, 5]);
    const axis = new Axis().scale(s).orientation('y').tickCount(2).render(scene, 'y');

    const line = scene.children.find((c) => c.name === 'y_line');
    expect(line.geometry.parameters.height).toBeCloseTo(5);
    const tick = scene.children.find((c) => c.name === 'y_tick_0');
    expect(tick.position.y).toBeDefined();
    expect(tick.position.x).toBeCloseTo(-0.1);
  });

  it('default tickFormat delegates to the scale, custom tickFormat overrides it', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 100]).range([0, 10]);

    const defaultAxis = new Axis().scale(s).tickCount(5).render(scene, 'default');
    const expectedTicks = s.ticks(5);
    const expectedFormat = s.tickFormat(5);
    expect(defaultAxis.labels.map((l) => l.text)).toEqual(expectedTicks.map(expectedFormat));

    const customAxis = new Axis().scale(s).tickCount(5).tickFormat((v) => `${v}%`).render(scene, 'custom');
    expect(customAxis.labels.map((l) => l.text)).toEqual(expectedTicks.map((v) => `${v}%`));
  });

  it('labels carry the labelStyle and tick position, and are stub metadata (no scene mesh)', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 10]).range([0, 10]);
    const style = { color: 'gold' };
    const axis = new Axis().scale(s).tickCount(2).labelStyle(style).render(scene, 'a');

    expect(axis.labels.length).toBeGreaterThan(0);
    for (const l of axis.labels) {
      expect(l.type).toBe('label');
      expect(l.style).toBe(style);
    }
    expect(scene.children.some((c) => c.name.includes('label'))).toBe(false);
  });

  it('falls back to a band/ordinal scale\'s .domain() when .ticks() is absent', () => {
    const scene = new THREE.Scene();
    const s = scale.band().domain(['a', 'b']).range([0, 10]);
    const axis = new Axis().scale(s).render(scene, 'a');
    expect(axis.labels.map((l) => l.text)).toEqual(['a', 'b']);
  });

  it('throws when the scale range is not a finite number', () => {
    const scene = new THREE.Scene();
    const brokenScale = Object.assign((v) => v, { range: () => [0, NaN] });
    const axis = new Axis().scale(brokenScale);
    expect(() => axis.render(scene, 'a')).toThrow(TypeError);
  });

  it('throws when the scale exposes neither .ticks() nor .domain()', () => {
    const scene = new THREE.Scene();
    const bareScale = Object.assign((v) => v, { range: () => [0, 10] });
    const axis = new Axis().scale(bareScale);
    expect(() => axis.render(scene, 'a')).toThrow(/must expose either \.ticks\(\) or \.domain\(\)/);
  });
});

describe('Axis.dispose', () => {
  it('removes the spine and tick meshes from the scene', () => {
    const scene = new THREE.Scene();
    const s = scale.linear().domain([0, 10]).range([0, 10]);
    const axis = new Axis().scale(s).render(scene, 'a');
    expect(scene.children.length).toBeGreaterThan(0);

    axis.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('is idempotent', () => {
    const scene = new THREE.Scene();
    const axis = new Axis().scale(scale.linear().domain([0, 10]).range([0, 10])).render(scene, 'a');
    axis.dispose();
    expect(() => axis.dispose()).not.toThrow();
  });

  it('is a no-op before render() was ever called', () => {
    const axis = new Axis();
    expect(() => axis.dispose()).not.toThrow();
  });

  it('every chainable setter and render() throw after dispose', () => {
    const scene = new THREE.Scene();
    const axis = new Axis().scale(scale.linear().domain([0, 10]).range([0, 10])).render(scene, 'a');
    axis.dispose();

    const pattern = /Axis\.\w+: this Axis has been disposed/;
    expect(() => axis.scale(scale.linear())).toThrow(pattern);
    expect(() => axis.orientation('y')).toThrow(pattern);
    expect(() => axis.tickCount(3)).toThrow(pattern);
    expect(() => axis.tickFormat(() => '')).toThrow(pattern);
    expect(() => axis.tickSize(1)).toThrow(pattern);
    expect(() => axis.labelStyle({})).toThrow(pattern);
    expect(() => axis.render(new THREE.Scene(), 'b')).toThrow(pattern);
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { StateMachine } from '../../src/interact/StateMachine.js';
import { BarChart } from '../../src/chart/BarChart.js';
import { getUniforms } from '../../src/material/effects/EffectInjector.js';

function makeScene() {
  return new THREE.Scene();
}

function makeChart(rows = [{ id: 0, value: 1 }, { id: 1, value: 2 }]) {
  const chart = new BarChart(makeScene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

describe('StateMachine constructor', () => {
  it('throws TypeError if chart has no selection() method', () => {
    expect(() => new StateMachine({})).toThrow(TypeError);
    expect(() => new StateMachine(null)).toThrow(TypeError);
  });

  it('exposes the wrapped chart via .chart', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    expect(stateMachine.chart).toBe(chart);
  });
});

describe('StateMachine.stateOf', () => {
  it("defaults to 'default' for a never-set datum", () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    expect(stateMachine.stateOf({ id: 0, value: 1 })).toBe('default');
  });
});

describe('StateMachine.setState', () => {
  it('updates stateOf() and is one of the fixed vocabulary', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];

    stateMachine.setState(datum, 'hovered');
    expect(stateMachine.stateOf(datum)).toBe('hovered');

    stateMachine.setState(datum, 'selected');
    expect(stateMachine.stateOf(datum)).toBe('selected');

    stateMachine.setState(datum, 'default');
    expect(stateMachine.stateOf(datum)).toBe('default');
  });

  it('throws TypeError for an unrecognized state', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.setState({}, 'bogus')).toThrow(TypeError);
  });

  it('returns this for chaining', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(stateMachine.setState({}, 'hovered')).toBe(stateMachine);
  });

  it('applies the configured style() response, scoped to just that datum', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const [datum0, datum1] = chart.data();
    const seen = [];
    stateMachine.style('hovered', (selection, datum) => {
      seen.push(datum);
      selection.attr('color', 'gold');
    });

    stateMachine.setState(datum0, 'hovered');
    expect(seen).toEqual([datum0]);

    const gold = new THREE.Color('gold').getHexString();
    const backend = chart.selection().backend;
    const mesh0 = backend.meshes.find((m) => m.getUserData('datum') === datum0);
    const mesh1 = backend.meshes.find((m) => m.getUserData('datum') === datum1);
    expect(mesh0.material.color.getHexString()).toBe(gold);
    expect(mesh1.material.color.getHexString()).not.toBe(gold);
  });

  it('does not invoke the response function when the datum is already in that state', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const responseFn = vi.fn();
    stateMachine.style('hovered', responseFn);

    stateMachine.setState(datum, 'hovered');
    stateMachine.setState(datum, 'hovered');
    expect(responseFn).toHaveBeenCalledTimes(1);
  });

  it('is a no-op visually when no response is configured for the state', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    expect(() => stateMachine.setState(datum, 'hovered')).not.toThrow();
    expect(stateMachine.stateOf(datum)).toBe('hovered');
  });

  it('is a no-op visually when the datum is not currently bound/rendered by the chart', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const responseFn = vi.fn();
    stateMachine.style('hovered', responseFn);

    stateMachine.setState({ id: 999, value: 0 }, 'hovered');
    expect(responseFn).not.toHaveBeenCalled();
  });
});

describe('StateMachine.style', () => {
  it('two-in-one getter/setter: reads back the exact function passed, defaults to null', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(stateMachine.style('hovered')).toBeNull();
    const responseFn = () => {};
    stateMachine.style('hovered', responseFn);
    expect(stateMachine.style('hovered')).toBe(responseFn);
  });

  it('throws TypeError for an unrecognized state', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.style('bogus', () => {})).toThrow(TypeError);
  });

  it('throws TypeError if responseFn is given and is not a function', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.style('hovered', 'not-a-function')).toThrow(TypeError);
  });

  it('returns this for chaining when setting', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(stateMachine.style('hovered', () => {})).toBe(stateMachine);
  });
});

describe('StateMachine.hoverStyle / StateMachine.selectStyle (Prompt 150 defaults)', () => {
  it('default to a neonEdge outline effect; hover also defaults to a 1.05 scale, select to no scale change', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(stateMachine.hoverStyle()).toEqual({ effect: { name: 'neonEdge', options: expect.any(Object) }, scale: 1.05 });
    expect(stateMachine.selectStyle()).toEqual({ effect: { name: 'neonEdge', options: expect.any(Object) }, scale: 1 });
  });

  it('merge partial options and return this for chaining', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(stateMachine.hoverStyle({ scale: 1.2 })).toBe(stateMachine);
    expect(stateMachine.hoverStyle().scale).toBe(1.2);
    expect(stateMachine.hoverStyle().effect.name).toBe('neonEdge'); // untouched field preserved

    stateMachine.selectStyle({ effect: { name: 'glow', options: { color: 'gold' } } });
    expect(stateMachine.selectStyle()).toEqual({ effect: { name: 'glow', options: { color: 'gold' } }, scale: 1 });
  });

  it('throws TypeError for a non-plain-object argument', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.hoverStyle('nope')).toThrow(TypeError);
    expect(() => stateMachine.selectStyle(42)).toThrow(TypeError);
  });

  it('throws TypeError for a non-positive scale', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.hoverStyle({ scale: 0 })).toThrow(TypeError);
    expect(() => stateMachine.hoverStyle({ scale: -1 })).toThrow(TypeError);
  });

  it('throws TypeError for a malformed effect', () => {
    const stateMachine = new StateMachine(makeChart());
    expect(() => stateMachine.hoverStyle({ effect: { options: {} } })).toThrow(TypeError); // missing name
    expect(() => stateMachine.hoverStyle({ effect: 'glow' })).toThrow(TypeError); // must be an object or null
  });

  it('accepts { effect: null } to disable the effect while keeping the scale bump', () => {
    const stateMachine = new StateMachine(makeChart());
    stateMachine.hoverStyle({ effect: null });
    expect(stateMachine.hoverStyle().effect).toBeNull();
    expect(stateMachine.hoverStyle().scale).toBe(1.05);
  });
});

describe('StateMachine.setState — default visuals (Prompt 150)', () => {
  it('entering "hovered" scales the datum up by hoverStyle().scale and applies the default effect (material clone)', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const backend = chart.selection().backend;
    const mesh = backend.meshes.find((m) => m.getUserData('datum') === datum);
    const before = mesh.getScale();
    const originalMaterial = mesh.material;

    stateMachine.setState(datum, 'hovered');

    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x * 1.05, 5);
    expect(after.y).toBeCloseTo(before.y * 1.05, 5);
    expect(after.z).toBeCloseTo(before.z * 1.05, 5);
    expect(mesh.material).not.toBe(originalMaterial); // default effect cloned+swapped the material
  });

  it('leaving "hovered" restores the exact pre-hover scale', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const backend = chart.selection().backend;
    const mesh = backend.meshes.find((m) => m.getUserData('datum') === datum);
    const before = mesh.getScale();

    stateMachine.setState(datum, 'hovered');
    stateMachine.setState(datum, 'default');

    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
  });

  it('entering "selected" applies the default effect but does not change scale', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const backend = chart.selection().backend;
    const mesh = backend.meshes.find((m) => m.getUserData('datum') === datum);
    const before = mesh.getScale();
    const originalMaterial = mesh.material;

    stateMachine.setState(datum, 'selected');

    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(mesh.material).not.toBe(originalMaterial);
  });

  it('going selected -> default from a datum that was never hovered does not touch scale', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const backend = chart.selection().backend;
    const mesh = backend.meshes.find((m) => m.getUserData('datum') === datum);
    const before = mesh.getScale();

    stateMachine.setState(datum, 'selected');
    stateMachine.setState(datum, 'default');

    const after = mesh.getScale();
    expect(after.x).toBeCloseTo(before.x, 5);
  });

  it("chart.hoverEffect() overrides the state machine's own hoverStyle default", () => {
    const chart = makeChart();
    chart.hoverEffect('fire', { intensity: 1.9 });
    const stateMachine = new StateMachine(chart);
    const datum = chart.data()[0];
    const backend = chart.selection().backend;
    const mesh = backend.meshes.find((m) => m.getUserData('datum') === datum);

    stateMachine.setState(datum, 'hovered');

    // 'fire' declares no uColor_hover uniform (only intensity/speed/scale) —
    // the default 'neonEdge' does, so its absence confirms the chart's own
    // hoverEffect() config was used instead of the state machine's default.
    const uniforms = getUniforms(mesh.material);
    expect(uniforms.uColor_hover).toBeUndefined();
    expect(uniforms.uIntensity_hover.value).toBe(1.9);
  });

  it('a datum not currently bound/rendered is still a no-op (no throw)', () => {
    const chart = makeChart();
    const stateMachine = new StateMachine(chart);
    expect(() => stateMachine.setState({ id: 999, value: 0 }, 'hovered')).not.toThrow();
  });
});

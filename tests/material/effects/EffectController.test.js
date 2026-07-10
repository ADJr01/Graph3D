import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { applyEffect, removeEffect } from '../../../src/material/effects/EffectController.js';
import { getUniforms } from '../../../src/material/effects/EffectInjector.js';
import { phaseAttributeName, phaseUniformName } from '../../../src/material/effects/harness.js';
import { BarChart } from '../../../src/chart/BarChart.js';
import { loop } from '../../../src/core/Graph3DLoop.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function advanceFrame(addSpy) {
  addSpy.mock.calls.at(-1)[0](1); // 1 full second — always finishes a 150ms animation
}

function makeMeshChart() {
  const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
  chart.data([{ id: 0, value: 1 }, { id: 1, value: 2 }], (d) => d.id);
  chart.render();
  return chart;
}

function makeInstancedChart() {
  const rows = Array.from({ length: 60 }, (_unused, i) => ({ id: i, value: i + 1 }));
  const chart = new BarChart(new THREE.Scene()).x((d) => d.id).y((d) => d.value);
  chart.data(rows, (d) => d.id);
  chart.render();
  return chart;
}

describe('applyEffect / removeEffect — meshes backend', () => {
  it('clones the hit mesh\'s material and animates its phase uniform toward 1', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const chart = makeMeshChart();
    const backend = chart.selection().backend;
    const original = backend.meshes[0].three.material;

    applyEffect(backend, 0, 'hover', 'glow');
    expect(backend.meshes[0].three.material).not.toBe(original);

    advanceFrame(addSpy);
    const uniforms = getUniforms(backend.meshes[0].three.material);
    expect(uniforms[phaseUniformName('hover')].value).toBe(1);
  });

  it('leaves other meshes untouched', () => {
    const chart = makeMeshChart();
    const backend = chart.selection().backend;
    const original1 = backend.meshes[1].three.material;

    applyEffect(backend, 0, 'hover', 'glow');
    expect(backend.meshes[1].three.material).toBe(original1);
  });

  it('removeEffect fades the phase back to 0 then restores the original material', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const chart = makeMeshChart();
    const backend = chart.selection().backend;
    const original = backend.meshes[0].three.material;

    applyEffect(backend, 0, 'hover', 'glow');
    advanceFrame(addSpy);
    removeEffect(backend, 0, 'hover');
    advanceFrame(addSpy);

    expect(backend.meshes[0].three.material).toBe(original);
  });

  it('two slots (hover + select) on the same mesh coexist; removing one keeps the other active', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const chart = makeMeshChart();
    const backend = chart.selection().backend;
    const original = backend.meshes[0].three.material;

    applyEffect(backend, 0, 'hover', 'glow');
    applyEffect(backend, 0, 'select', 'pulse');
    advanceFrame(addSpy);
    const clone = backend.meshes[0].three.material;

    removeEffect(backend, 0, 'hover');
    advanceFrame(addSpy);
    // select is still active, so the clone must not have been restored/disposed yet.
    expect(backend.meshes[0].three.material).toBe(clone);

    removeEffect(backend, 0, 'select');
    advanceFrame(addSpy);
    expect(backend.meshes[0].three.material).toBe(original);
  });
});

describe('applyEffect / removeEffect — instanced backend', () => {
  it('bakes the effect into the shared material once and drives a per-instance phase attribute', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const chart = makeInstancedChart();
    const backend = chart.selection().backend;
    const sharedMaterial = backend.object.material;

    applyEffect(backend, 3, 'hover', 'glow');
    expect(backend.object.material).toBe(sharedMaterial); // no clone — shared material stays shared
    expect(backend.object.hasAttribute(phaseAttributeName('hover'))).toBe(true);

    advanceFrame(addSpy);
    expect(backend.object.getInstanceAttribute(backend.indices[3], phaseAttributeName('hover'))).toBe(1);
    // every other instance's phase stays at 0 — only the targeted one renders the effect.
    expect(backend.object.getInstanceAttribute(backend.indices[4], phaseAttributeName('hover'))).toBe(0);
  });

  it('removeEffect fades the targeted instance\'s phase back to 0', () => {
    const addSpy = vi.spyOn(loop, 'add');
    const chart = makeInstancedChart();
    const backend = chart.selection().backend;

    applyEffect(backend, 3, 'hover', 'glow');
    advanceFrame(addSpy);
    removeEffect(backend, 3, 'hover');
    advanceFrame(addSpy);
    expect(backend.object.getInstanceAttribute(backend.indices[3], phaseAttributeName('hover'))).toBe(0);
  });

  it('re-applying the same preset to a second instance does not rebake the shared material', () => {
    const chart = makeInstancedChart();
    const backend = chart.selection().backend;
    applyEffect(backend, 3, 'hover', 'glow');
    const versionAfterFirst = backend.object.material.version;

    applyEffect(backend, 5, 'hover', 'glow');
    expect(backend.object.material.version).toBe(versionAfterFirst);
  });
});

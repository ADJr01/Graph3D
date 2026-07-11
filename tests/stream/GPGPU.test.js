import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleMessage } from '../../src/core/worker/tasks.js';
import { layout } from '../../src/compose/index.js';

// Mirrors postfx/PostFX.test.js's pattern for optional three/examples/jsm
// modules: replace the real GPUComputationRenderer with a mock that records
// calls, since jsdom has no real WebGL context to run an actual shader.
const createTextureMock = vi.fn();
const createShaderMaterialMock = vi.fn();
const createRenderTargetMock = vi.fn();
const doRenderTargetMock = vi.fn();
const gpuComputeDisposeMock = vi.fn();

vi.mock('three/examples/jsm/misc/GPUComputationRenderer.js', () => ({
  GPUComputationRenderer: vi.fn().mockImplementation(function (sizeX, sizeY) {
    this.sizeX = sizeX;
    this.sizeY = sizeY;
    this.createTexture = createTextureMock.mockImplementation(() => ({
      image: { data: new Float32Array(sizeX * sizeY * 4) },
      needsUpdate: false,
      dispose: vi.fn(),
    }));
    this.createShaderMaterial = createShaderMaterialMock.mockImplementation((shader, uniforms) => ({ uniforms, dispose: vi.fn() }));
    this.createRenderTarget = createRenderTargetMock.mockImplementation(() => ({ dispose: vi.fn() }));
    this.doRenderTarget = doRenderTargetMock;
    this.dispose = gpuComputeDisposeMock;
  }),
}));

import { GPGPU } from '../../src/stream/GPGPU.js';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// FakeWorker bridging postMessage to the real task registry — mirrors
// tests/stream/Aggregator.test.js/decimate.test.js/LOD.test.js's own pattern.
class FakeWorker {
  constructor() {
    this.onmessage = null;
  }
  postMessage(data) {
    if (data?.type === 'register') return;
    setTimeout(() => handleMessage(data, (response) => this.onmessage?.({ data: response })), 0);
  }
  terminate() {}
}

const origCreateObjectURL = URL.createObjectURL;
beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  URL.createObjectURL = vi.fn(() => 'blob:test-gpgpu');
  createTextureMock.mockClear();
  createShaderMaterialMock.mockClear();
  createRenderTargetMock.mockClear();
  doRenderTargetMock.mockClear();
  gpuComputeDisposeMock.mockClear();
  vi.mocked(GPUComputationRenderer).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  URL.createObjectURL = origCreateObjectURL;
});

function delay(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('GPGPU constructor', () => {
  it('throws for a non-positive threshold', () => {
    expect(() => new GPGPU({ threshold: 0 })).toThrow(TypeError);
    expect(() => new GPGPU({ threshold: -1 })).toThrow(TypeError);
  });

  it('backend is "worker" without a renderer, even with floatTextures true', () => {
    const gpgpu = new GPGPU({ capabilities: { floatTextures: true } });
    expect(gpgpu.backend).toBe('worker');
  });

  it('backend is "worker" with a renderer but floatTextures false', () => {
    const gpgpu = new GPGPU({ renderer: {}, capabilities: { floatTextures: false } });
    expect(gpgpu.backend).toBe('worker');
  });

  it('backend is "gpu" with both a renderer and floatTextures true', () => {
    const gpgpu = new GPGPU({ renderer: {}, capabilities: { floatTextures: true } });
    expect(gpgpu.backend).toBe('gpu');
  });
});

describe('computeCharge(positions, options) — worker backend', () => {
  it('throws TypeError for a non-Float32Array or a length not a multiple of 3', async () => {
    const gpgpu = new GPGPU({});
    await expect(gpgpu.computeCharge([0, 0, 0])).rejects.toThrow(TypeError);
    await expect(gpgpu.computeCharge(new Float32Array([0, 0]))).rejects.toThrow(TypeError);
  });

  it('resolves accelerations via the real worker-task dispatch path', async () => {
    const gpgpu = new GPGPU({});
    const result = await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0]), { strength: -30 });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result).toHaveLength(6);
    expect(result[0]).toBeLessThan(0); // repelled away from node 1
    expect(result[3]).toBeGreaterThan(0); // repelled away from node 0
    gpgpu.dispose();
  });

  it('rejects after dispose()', async () => {
    const gpgpu = new GPGPU({});
    gpgpu.dispose();
    await expect(gpgpu.computeCharge(new Float32Array([0, 0, 0]))).rejects.toThrow(Error);
  });
});

describe('computeCharge(positions, options) — gpu backend', () => {
  function makeRenderer(fillFirstNode = [1, 2, 3]) {
    return {
      readRenderTargetPixels: vi.fn((_target, _x, _y, _w, _h, buffer) => {
        buffer[0] = fillFirstNode[0];
        buffer[1] = fillFirstNode[1];
        buffer[2] = fillFirstNode[2];
        buffer[3] = 1;
      }),
    };
  }

  it('creates a GPUComputationRenderer sized to fit the node count and reads back accelerations', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });

    const result = await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0]));

    expect(GPUComputationRenderer).toHaveBeenCalledTimes(1);
    expect(GPUComputationRenderer).toHaveBeenCalledWith(2, 2, renderer); // ceil(sqrt(2)) = 2
    expect(doRenderTargetMock).toHaveBeenCalledTimes(1);
    expect(renderer.readRenderTargetPixels).toHaveBeenCalledTimes(1);
    expect(result).toEqual(new Float32Array([1, 2, 3, 0, 0, 0]));
    gpgpu.dispose();
  });

  it('passes nodeCount/strength/distance uniforms to the shader material', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });

    await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]), { strength: -50, distanceMin: 2, distanceMax: 100 });

    const uniforms = createShaderMaterialMock.mock.calls[0][1];
    expect(uniforms.nodeCount.value).toBe(3);
    expect(uniforms.strength.value).toBe(-50);
    expect(uniforms.distanceMin.value).toBe(2);
    expect(uniforms.distanceMax.value).toBe(100);
    gpgpu.dispose();
  });

  it('substitutes a large finite value for an Infinity distanceMax (GLSL has no literal Infinity)', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });

    await gpgpu.computeCharge(new Float32Array([0, 0, 0]));

    const uniforms = createShaderMaterialMock.mock.calls[0][1];
    expect(Number.isFinite(uniforms.distanceMax.value)).toBe(true);
    expect(uniforms.distanceMax.value).toBeGreaterThan(1e10);
    gpgpu.dispose();
  });

  it('reuses the same GPUComputationRenderer across calls with the same node count', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });

    await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0]));
    await gpgpu.computeCharge(new Float32Array([2, 0, 0, 3, 0, 0]));

    expect(GPUComputationRenderer).toHaveBeenCalledTimes(1);
    gpgpu.dispose();
  });

  it('recreates the GPUComputationRenderer (disposing the old one) when node count changes size', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });

    await gpgpu.computeCharge(new Float32Array([0, 0, 0])); // n=1, size=1
    await gpgpu.computeCharge(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0])); // n=5, size=3

    expect(GPUComputationRenderer).toHaveBeenCalledTimes(2);
    expect(gpuComputeDisposeMock).toHaveBeenCalledTimes(1);
    gpgpu.dispose();
  });

  it('dispose() releases the GPUComputationRenderer and is idempotent', async () => {
    const renderer = makeRenderer();
    const gpgpu = new GPGPU({ renderer, capabilities: { floatTextures: true } });
    await gpgpu.computeCharge(new Float32Array([0, 0, 0]));

    gpgpu.dispose();
    expect(gpuComputeDisposeMock).toHaveBeenCalledTimes(1);
    expect(() => gpgpu.dispose()).not.toThrow();
  });
});

describe('attach(sim, options)', () => {
  it('throws TypeError for a sim missing force()/nodes()', () => {
    const gpgpu = new GPGPU({});
    expect(() => gpgpu.attach({})).toThrow(TypeError);
    expect(() => gpgpu.attach({ force: () => {} })).toThrow(TypeError);
  });

  it('below threshold, the registered charge force matches layout.force.charge exactly', () => {
    const gpgpu = new GPGPU({ threshold: 100 });
    const sim = layout.force().nodes([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    gpgpu.attach(sim, { strength: -30 });
    const wrapped = sim.force('charge');
    const plain = layout.force.charge(-30, {});

    const nodesA = [{ x: 0, y: 0, z: 0, __ax: 0, __ay: 0, __az: 0 }, { x: 1, y: 0, z: 0, __ax: 0, __ay: 0, __az: 0 }];
    const nodesB = [{ x: 0, y: 0, z: 0, __ax: 0, __ay: 0, __az: 0 }, { x: 1, y: 0, z: 0, __ax: 0, __ay: 0, __az: 0 }];
    wrapped(nodesA, 1);
    plain(nodesB, 1);

    expect(nodesA[0].__ax).toBeCloseTo(nodesB[0].__ax);
    expect(nodesA[1].__ax).toBeCloseTo(nodesB[1].__ax);
    gpgpu.dispose();
  });

  it('above threshold, contributes zero on the first call then the resolved GPGPU result on later calls', async () => {
    const gpgpu = new GPGPU({ threshold: 1 }); // 2 nodes > threshold
    const sim = layout.force().nodes([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    gpgpu.attach(sim, { strength: -30 });
    const chargeFn = sim.force('charge');
    const nodes = sim.nodes();

    chargeFn(nodes, 1);
    expect(nodes[0].__ax).toBe(0); // no cached result yet

    await delay();

    nodes[0].__ax = 0; // computeAccelerations() normally resets this each tick; simulate that here
    chargeFn(nodes, 1);
    expect(nodes[0].__ax).not.toBe(0); // now applying the cached (worker-resolved) result
    gpgpu.dispose();
  });

  it('does not throw or crash the tick when dispose() happens while a computation is above threshold', async () => {
    const gpgpu = new GPGPU({ threshold: 1 });
    const sim = layout.force().nodes([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    gpgpu.attach(sim);
    const chargeFn = sim.force('charge');

    expect(() => chargeFn(sim.nodes(), 1)).not.toThrow();
    gpgpu.dispose();
    expect(() => chargeFn(sim.nodes(), 1)).not.toThrow();
    await delay();
  });
});

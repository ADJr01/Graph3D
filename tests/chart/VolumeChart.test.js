import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VolumeChart } from '../../src/chart/VolumeChart.js';
import { palette } from '../../src/compose/index.js';

function makeScene() {
  return new THREE.Scene();
}

const gaussian = (x, y, z) => Math.exp(-(x * x + y * y + z * z));

describe('VolumeChart', () => {
  describe('constructor', () => {
    it('throws if scene is falsy (inherited from GraphChart)', () => {
      expect(() => new VolumeChart(null)).toThrow(TypeError);
    });
  });

  describe('.values()', () => {
    it('getter/setter accepts a function', () => {
      const chart = new VolumeChart(makeScene());
      expect(chart.values()).toBeNull();
      chart.values(gaussian);
      expect(chart.values()).toBe(gaussian);
    });

    it('throws for a non-function', () => {
      expect(() => new VolumeChart(makeScene()).values('nope')).toThrow(TypeError);
    });
  });

  describe('.xDomain()/.yDomain()/.zDomain()', () => {
    it('default to [-1, 1]', () => {
      const chart = new VolumeChart(makeScene());
      expect(chart.xDomain()).toEqual([-1, 1]);
      expect(chart.yDomain()).toEqual([-1, 1]);
      expect(chart.zDomain()).toEqual([-1, 1]);
    });

    it('getters/setters accept a [min, max] array', () => {
      const chart = new VolumeChart(makeScene());
      chart.xDomain([-3, 3]);
      expect(chart.xDomain()).toEqual([-3, 3]);
      chart.yDomain([0, 5]);
      expect(chart.yDomain()).toEqual([0, 5]);
      chart.zDomain([-2, 2]);
      expect(chart.zDomain()).toEqual([-2, 2]);
    });

    it('throws for an invalid domain', () => {
      const chart = new VolumeChart(makeScene());
      expect(() => chart.xDomain('nope')).toThrow(TypeError);
      expect(() => chart.xDomain([1])).toThrow(TypeError);
      expect(() => chart.xDomain([2, 1])).toThrow(TypeError); // min must be < max
      expect(() => chart.xDomain([1, 1])).toThrow(TypeError);
      expect(() => chart.xDomain([NaN, 1])).toThrow(TypeError);
    });
  });

  describe('.resolution()/.steps()/.densityScale()/.opacity()', () => {
    it('default resolution=32, steps=64, densityScale=1, opacity=1', () => {
      const chart = new VolumeChart(makeScene());
      expect(chart.resolution()).toBe(32);
      expect(chart.steps()).toBe(64);
      expect(chart.densityScale()).toBe(1);
      expect(chart.opacity()).toBe(1);
    });

    it('getters/setters work', () => {
      const chart = new VolumeChart(makeScene());
      chart.resolution(16);
      expect(chart.resolution()).toBe(16);
      chart.steps(96);
      expect(chart.steps()).toBe(96);
      chart.densityScale(2.5);
      expect(chart.densityScale()).toBe(2.5);
      chart.opacity(0.5);
      expect(chart.opacity()).toBe(0.5);
    });

    it('throws for invalid values', () => {
      const chart = new VolumeChart(makeScene());
      expect(() => chart.resolution(0)).toThrow(TypeError);
      expect(() => chart.resolution(2.5)).toThrow(TypeError);
      expect(() => chart.steps(0)).toThrow(TypeError);
      expect(() => chart.densityScale(NaN)).toThrow(TypeError);
      expect(() => chart.opacity(Infinity)).toThrow(TypeError);
      expect(() => chart.opacity('nope')).toThrow(TypeError);
    });
  });

  describe('.palette()', () => {
    it('defaults to palette.viridis', () => {
      expect(new VolumeChart(makeScene()).palette()).toBe(palette.viridis);
    });

    it('getter/setter accepts a function', () => {
      const chart = new VolumeChart(makeScene());
      chart.palette(palette.plasma);
      expect(chart.palette()).toBe(palette.plasma);
    });

    it('throws for a non-function', () => {
      expect(() => new VolumeChart(makeScene()).palette('nope')).toThrow(TypeError);
    });
  });

  describe('render() — one volume cube', () => {
    it('throws calling render() before values(fn)', () => {
      expect(() => new VolumeChart(makeScene()).render()).toThrow(/call values\(fn\)/);
    });

    it('renders exactly one mesh spanning the configured domains', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).xDomain([-2, 2]).yDomain([-3, 3]).zDomain([-1, 1]).resolution(4);
      chart.render();

      expect(scene.children).toHaveLength(1);
      const mesh = scene.children[0];
      expect(mesh.position.toArray()).toEqual([0, 0, 0]); // domains centered on 0
      expect(mesh.scale.toArray()).toEqual([4, 6, 2]); // span of each domain
    });

    it('offsets the mesh position to the domain center when domains are not centered on 0', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).xDomain([0, 4]).yDomain([0, 4]).zDomain([0, 4]).resolution(4);
      chart.render();
      expect(scene.children[0].position.toArray()).toEqual([2, 2, 2]);
    });

    it('samples the field on a resolution^3 grid uploaded as a Data3DTexture', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).resolution(6);
      chart.render();
      const texture = scene.children[0].material.uniforms.densityTexture.value;
      expect(texture.image.width).toBe(6);
      expect(texture.image.height).toBe(6);
      expect(texture.image.depth).toBe(6);
    });

    it('normalizes sampled densities to [0, 1]', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values((x, y, z) => x + y + z).resolution(4);
      chart.render();
      const data = scene.children[0].material.uniforms.densityTexture.value.image.data;
      for (const v of data) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.min(...data)).toBeCloseTo(0);
      expect(Math.max(...data)).toBeCloseTo(1);
    });

    it('handles a constant field (max === min) without NaN', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(() => 5).resolution(3);
      chart.render();
      const data = scene.children[0].material.uniforms.densityTexture.value.image.data;
      for (const v of data) expect(Number.isFinite(v)).toBe(true);
    });
  });

  describe('update()', () => {
    it('throws calling update() before render()', () => {
      const chart = new VolumeChart(makeScene()).values(gaussian);
      expect(() => chart.update()).toThrow(/call render\(\) first/);
    });

    it('rebuilds the volume mesh (still exactly one) on update()', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).resolution(4);
      chart.render();
      const firstMesh = scene.children[0];

      chart.resolution(8);
      chart.update();

      expect(scene.children).toHaveLength(1);
      expect(scene.children[0]).not.toBe(firstMesh);
      expect(scene.children[0].material.uniforms.densityTexture.value.image.width).toBe(8);
    });
  });

  describe('destroy()', () => {
    it('disposes the volume mesh and is idempotent', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).resolution(4);
      chart.render();
      expect(scene.children.length).toBe(1);

      chart.destroy();
      expect(scene.children.length).toBe(0);
      expect(() => chart.destroy()).not.toThrow();
    });

    it('disposing also disposes the volumeRaymarch material\'s textures', () => {
      const scene = makeScene();
      const chart = new VolumeChart(scene).values(gaussian).resolution(4);
      chart.render();
      const material = scene.children[0].material;
      const texture = material.uniforms.densityTexture.value;
      let disposed = false;
      texture.addEventListener('dispose', () => { disposed = true; });

      chart.destroy();
      expect(disposed).toBe(true);
    });

    it('throws calling public methods after destroy()', () => {
      const chart = new VolumeChart(makeScene()).values(gaussian).resolution(4);
      chart.render();
      chart.destroy();

      expect(() => chart.render()).toThrow(/destroyed/);
      expect(() => chart.update()).toThrow(/destroyed/);
      expect(() => chart.values(gaussian)).toThrow(/destroyed/);
      expect(() => chart.resolution(4)).toThrow(/destroyed/);
    });
  });
});

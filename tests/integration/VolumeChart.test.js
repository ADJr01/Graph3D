import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VolumeChart } from '../../src/chart/VolumeChart.js';
import { palette } from '../../src/compose/index.js';

/**
 * Integration coverage for VolumeChart (Prompt 139): a full render -> update
 * -> destroy lifecycle against a real THREE.Scene, exercising the sampled
 * `Data3DTexture` upload, domain repositioning/rescaling, `.palette()`, and
 * disposal of the `volumeRaymarch` material's owned textures.
 */
describe('VolumeChart / integration', () => {
  it('samples a Gaussian field into a Data3DTexture and positions/scales the cube to its domains', () => {
    const scene = new THREE.Scene();
    const chart = new VolumeChart(scene)
      .values((x, y, z) => Math.exp(-(x * x + y * y + z * z)))
      .xDomain([-2, 2])
      .yDomain([-2, 2])
      .zDomain([-2, 2])
      .resolution(16)
      .steps(48)
      .palette(palette.plasma);
    chart.render();

    expect(scene.children).toHaveLength(1);
    const mesh = scene.children[0];
    expect(mesh.scale.toArray()).toEqual([4, 4, 4]);
    expect(mesh.position.toArray()).toEqual([0, 0, 0]);

    const material = mesh.material;
    expect(material.uniforms.steps.value).toBe(48);
    const texture = material.uniforms.densityTexture.value;
    expect(texture).toBeInstanceOf(THREE.Data3DTexture);
    expect(texture.image.width).toBe(16);

    // A Gaussian centered at the origin peaks in the middle of the grid —
    // the center sample should normalize close to 1 (the field's own max).
    const r = 16;
    const centerIndex = Math.floor(r / 2) * r * r + Math.floor(r / 2) * r + Math.floor(r / 2);
    expect(texture.image.data[centerIndex]).toBeGreaterThan(0.8);
  });

  it('re-samples on update() when the domain or resolution changes', () => {
    const scene = new THREE.Scene();
    const chart = new VolumeChart(scene).values((x, y, z) => x + y + z).resolution(8);
    chart.render();

    chart.xDomain([-5, 5]).resolution(12);
    chart.update();

    expect(scene.children).toHaveLength(1);
    const mesh = scene.children[0];
    expect(mesh.scale.x).toBe(10);
    expect(mesh.material.uniforms.densityTexture.value.image.width).toBe(12);
  });

  it('destroy() disposes the mesh and its material-owned density/palette textures, and is idempotent', () => {
    const scene = new THREE.Scene();
    const chart = new VolumeChart(scene).values((x, y, z) => x * y * z).resolution(6);
    chart.render();

    const material = scene.children[0].material;
    const densityTexture = material.uniforms.densityTexture.value;
    const paletteTexture = material.uniforms.paletteTexture.value;
    let densityDisposed = false;
    let paletteDisposed = false;
    densityTexture.addEventListener('dispose', () => { densityDisposed = true; });
    paletteTexture.addEventListener('dispose', () => { paletteDisposed = true; });

    chart.destroy();
    expect(scene.children.length).toBe(0);
    expect(densityDisposed).toBe(true);
    expect(paletteDisposed).toBe(true);
    expect(() => chart.destroy()).not.toThrow();
    expect(() => chart.render()).toThrow(/destroyed/);
  });
});

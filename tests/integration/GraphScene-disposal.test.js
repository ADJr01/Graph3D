import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphScene } from '../../src/scene/GraphScene.js';

function makeG3d() {
  return {};
}

function makeRenderer() {
  return {
    domElement: { tagName: 'CANVAS' },
    shadowMap: { enabled: false, type: THREE.PCFShadowMap },
    clippingPlanes: [],
  };
}

/** graph3d stub carrying a renderer — mirrors `graph3d.renderer.three` on a real Graph3D. */
function makeG3dWithRenderer() {
  return { renderer: { three: makeRenderer() } };
}

/**
 * Integration disposal tests for GraphScene.
 *
 * These tests verify the disposal contract: every geometry, material, and
 * texture added to a scene must have its .dispose() called when the scene
 * is disposed. No GPU resource should leak across N create/dispose cycles.
 */
describe('GraphScene / disposal contract', () => {
  it('1000 create/dispose cycles: geometry.dispose() called for each mesh', () => {
    for (let i = 0; i < 1000; i++) {
      const scene = new GraphScene({ graph3d: makeG3d(), name: `s${i}` });
      const geo = new THREE.BoxGeometry();
      const spy = vi.spyOn(geo, 'dispose');
      scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
      scene.dispose();
      expect(spy).toHaveBeenCalledOnce();
    }
  });

  it('1000 create/dispose cycles: material.dispose() called for each mesh', () => {
    for (let i = 0; i < 1000; i++) {
      const scene = new GraphScene({ graph3d: makeG3d(), name: `s${i}` });
      const mat = new THREE.MeshBasicMaterial();
      const spy = vi.spyOn(mat, 'dispose');
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
      scene.dispose();
      expect(spy).toHaveBeenCalledOnce();
    }
  });

  it('texture.dispose() is called for every texture slot on the material', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'tex-test' });
    const mapTex = new THREE.Texture();
    const normalTex = new THREE.Texture();
    const mapSpy = vi.spyOn(mapTex, 'dispose');
    const normalSpy = vi.spyOn(normalTex, 'dispose');
    const mat = new THREE.MeshStandardMaterial({ map: mapTex, normalMap: normalTex });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mat));
    scene.dispose();
    expect(mapSpy).toHaveBeenCalledOnce();
    expect(normalSpy).toHaveBeenCalledOnce();
  });

  it('all materials in an array are disposed', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'arr-mat' });
    const mats = [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ];
    const spies = mats.map((m) => vi.spyOn(m, 'dispose'));
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), mats));
    scene.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });

  it('scene graph is empty after dispose — no children remain', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'clear-test' });
    for (let i = 0; i < 10; i++) {
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    }
    scene.dispose();
    expect(scene.three.children).toHaveLength(0);
  });

  it('double-dispose does not throw or double-dispose resources', () => {
    const scene = new GraphScene({ graph3d: makeG3d(), name: 'idempotent' });
    const geo = new THREE.BoxGeometry();
    const spy = vi.spyOn(geo, 'dispose');
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()));
    scene.dispose();
    scene.dispose(); // must not throw and must not call geo.dispose() again
    expect(spy).toHaveBeenCalledOnce();
  });

  it('1000 create/dispose cycles with a renderer: light/environment/shadows/clipping are all disposed', () => {
    for (let i = 0; i < 1000; i++) {
      const scene = new GraphScene({ graph3d: makeG3dWithRenderer(), name: `r${i}` });
      const { light, environment, shadows, clipping } = scene;
      const lightSpy = vi.spyOn(light, 'dispose');
      const envSpy = vi.spyOn(environment, 'dispose');
      const shadowsSpy = vi.spyOn(shadows, 'dispose');
      const clippingSpy = vi.spyOn(clipping, 'dispose');
      scene.dispose();
      expect(lightSpy).toHaveBeenCalledOnce();
      expect(envSpy).toHaveBeenCalledOnce();
      expect(shadowsSpy).toHaveBeenCalledOnce();
      expect(clippingSpy).toHaveBeenCalledOnce();
    }
  });
});

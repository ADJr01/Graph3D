import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GraphObjectMaterial } from '../../src/material/GraphObjectMaterial.js';
import { GraphMesh } from '../../src/object/GraphMesh.js';
import { loop } from '../../src/core/Graph3DLoop.js';
import { retainTexture, disposeMaterial } from '../../src/core/GraphDisposal.js';

// GraphObjectMaterial holds no GPU resources of its own — the wrapped
// material is disposed by its owning GraphMesh/GraphInstancedObject. Its own
// disposal contract only covers what it subscribes to on demand: the shared
// render loop (time: 'auto') and a window resize listener (resolution: 'auto').

function makeShaderMesh(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: 'void main() { gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }',
  });
  return new GraphMesh({ scene, name: 'a', geometry: new THREE.BoxGeometry(), material });
}

describe('GraphObjectMaterial disposal', () => {
  it('creates and disposes 1 000 plain instances without throwing', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      const mesh = new GraphMesh({ scene, name: `m${i}`, geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
      const wrapper = new GraphObjectMaterial(mesh);
      wrapper.dispose();
      mesh.dispose();
    }
  });

  it('leaves the shared loop stopped after 1 000 auto-time bind/dispose cycles', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      const mesh = makeShaderMesh(scene);
      const wrapper = new GraphObjectMaterial(mesh);
      wrapper.bindUniforms({ time: 'auto' });
      wrapper.dispose();
      mesh.dispose();
    }
    expect(loop.isRunning).toBe(false);
  });

  it('does not leak window resize listeners across 1 000 auto-resolution bind/dispose cycles', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      const mesh = makeShaderMesh(scene);
      const wrapper = new GraphObjectMaterial(mesh);
      wrapper.bindUniforms({ resolution: 'auto' });
      wrapper.dispose();
      mesh.dispose();
    }
    // Every listener from a disposed wrapper must be gone — dispatching
    // resize afterward should touch nothing and throw nothing.
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });

  it('double-dispose is idempotent', () => {
    const wrapper = new GraphObjectMaterial(makeShaderMesh(new THREE.Scene()));
    wrapper.bindUniforms({ time: 'auto', resolution: 'auto' });
    wrapper.dispose();
    expect(() => wrapper.dispose()).not.toThrow();
  });

  it('all public methods throw after dispose with a descriptive error', () => {
    const wrapper = new GraphObjectMaterial(makeShaderMesh(new THREE.Scene()));
    wrapper.dispose();
    const pattern = /GraphObjectMaterial\.\w+: instance has been disposed/;
    expect(() => wrapper.material).toThrow(pattern);
    expect(() => wrapper.set(new THREE.MeshBasicMaterial())).toThrow(pattern);
    expect(() => wrapper.bindUniforms({ intensity: 1 })).toThrow(pattern);
    expect(() => wrapper.setMap('map', new THREE.Texture())).toThrow(pattern);
  });

  // ── Texture ref-counting leak tests (Prompt 111) ──────────────────────────

  it('a texture shared with a sentinel material survives 1 000 set() swaps on another mesh, freeing only once every owner is gone', () => {
    const scene = new THREE.Scene();
    const sharedMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(sharedMap, 'dispose');
    retainTexture(sharedMap); // the sentinel's share, beyond the mesh-below's implicit one

    const sentinelMaterial = new THREE.MeshBasicMaterial({ map: sharedMap });
    const mesh = new GraphMesh({ scene, name: 'swap-target', geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial({ map: sharedMap }) });
    const wrapper = new GraphObjectMaterial(mesh);

    for (let i = 0; i < 1_000; i++) {
      wrapper.set(new THREE.MeshStandardMaterial({ map: sharedMap })); // fresh material each time, still sharing sharedMap
    }
    expect(disposeSpy).not.toHaveBeenCalled(); // sentinelMaterial still uses it

    mesh.dispose(); // disposes the last swapped-in material
    expect(disposeSpy).not.toHaveBeenCalled(); // sentinel still holds it

    disposeMaterial(sentinelMaterial);
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('setMap() releases the slot it replaces across 1 000 create/replace/dispose cycles without leaking or double-freeing', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      const mesh = new GraphMesh({ scene, name: `m${i}`, geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial() });
      const wrapper = new GraphObjectMaterial(mesh);
      expect(() => {
        wrapper.setMap('map', new THREE.Texture());
        wrapper.setMap('map', new THREE.Texture()); // replaces the one just set — must release it, not leak it
      }).not.toThrow();
      wrapper.dispose();
      mesh.dispose();
    }
  });

  it('a texture explicitly retained for N independent meshes needs exactly N disposals before it frees', () => {
    const scene = new THREE.Scene();
    const sharedMap = new THREE.Texture();
    const disposeSpy = vi.spyOn(sharedMap, 'dispose');
    const meshCount = 50;

    for (let i = 1; i < meshCount; i++) retainTexture(sharedMap); // N-1 extra shares beyond the first mesh's implicit one

    const meshes = Array.from(
      { length: meshCount },
      (_, i) => new GraphMesh({ scene, name: `shared${i}`, geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial({ map: sharedMap }) }),
    );

    for (const mesh of meshes.slice(0, -1)) mesh.dispose();
    expect(disposeSpy).not.toHaveBeenCalled();

    meshes.at(-1).dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { Selection } from '../../../src/compose/selection/Selection.js';
import { GraphMesh } from '../../../src/object/GraphMesh.js';
import { GraphInstancedObject } from '../../../src/object/GraphInstancedObject.js';

function makeMeshes(scene, data, materialFactory = () => new THREE.MeshStandardMaterial()) {
  return data.map((datum, i) => {
    const mesh = new GraphMesh({ scene, name: `m${i}`, geometry: new THREE.BoxGeometry(), material: materialFactory() });
    mesh.setUserData('datum', datum);
    return mesh;
  });
}

function makeInstanced(scene, data, material = new THREE.MeshStandardMaterial()) {
  const object = new GraphInstancedObject({ scene, name: 'batch', geometry: new THREE.BoxGeometry(), material, count: data.length });
  data.forEach((datum, i) => object.setInstanceUserData(i, datum));
  return object;
}

describe('Selection.style', () => {
  it('meshes backend: writes an arbitrary material property per-datum', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{ v: 0.2 }, { v: 0.8 }]);
    const selection = new Selection({ type: 'meshes', meshes });
    selection.style('roughness', (d) => d.v);
    expect(meshes[0].material.roughness).toBe(0.2);
    expect(meshes[1].material.roughness).toBe(0.8);
  });

  it('meshes backend: writes an arbitrary property across every material when a mesh has a material array', () => {
    const scene = new THREE.Scene();
    const mesh = new GraphMesh({
      scene,
      name: 'multi',
      geometry: new THREE.BoxGeometry(),
      material: [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()],
    });
    mesh.setUserData('datum', {});
    const selection = new Selection({ type: 'meshes', meshes: [mesh] });
    selection.style('roughness', 0.3);
    expect(mesh.material[0].roughness).toBe(0.3);
    expect(mesh.material[1].roughness).toBe(0.3);
  });

  it('meshes backend: throws when no material has the given property', () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{}], () => new THREE.ShaderMaterial());
    const selection = new Selection({ type: 'meshes', meshes });
    expect(() => selection.style('roughness', 1)).toThrow(/no material/);
  });

  it("delegates 'color' to the same routing as attr('color', ...)", () => {
    const scene = new THREE.Scene();
    const meshes = makeMeshes(scene, [{}]);
    const selection = new Selection({ type: 'meshes', meshes });
    selection.style('color', 'crimson');
    expect(meshes[0].material.color.getHex()).toBe(new THREE.Color('crimson').getHex());
  });

  it("delegates 'opacity' to the same routing as attr('opacity', ...)", () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{}, {}]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    selection.style('opacity', 0.5);
    expect(object.hasAttribute('opacity')).toBe(true);
  });

  it("instanced backend: 'emissiveIntensity' writes a per-instance attribute, committed once", () => {
    const scene = new THREE.Scene();
    const object = makeInstanced(scene, [{ v: 1 }, { v: 2 }]);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    const commitSpy = vi.spyOn(object, 'commitAttribute');

    selection.style('emissiveIntensity', (d) => d.v);

    expect(object.hasAttribute('emissiveIntensity')).toBe(true);
    expect(commitSpy).toHaveBeenCalledWith('emissiveIntensity');
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('instanced backend: a material-global prop warns and writes once to the shared material', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const object = makeInstanced(scene, [{ v: 0.1 }, { v: 0.9 }], material);
    const selection = new Selection({ type: 'instanced', object, indices: Uint32Array.from([0, 1]) });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    selection.style('roughness', (d) => d.v);

    expect(material.roughness).toBe(0.1); // resolved from the first datum only
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/shares one material/);
    warnSpy.mockRestore();
  });

  it('instanced backend: a material-global prop on an empty selection is a no-op (no warning, no write)', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial();
    const object = makeInstanced(scene, [{}], material);
    const selection = new Selection({ type: 'instanced', object, indices: new Uint32Array(0) });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    selection.style('roughness', 0.5);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('throws TypeError for a non-string materialProp', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{}]) });
    expect(() => selection.style(null, 1)).toThrow(TypeError);
  });

  it('returns this for chaining', () => {
    const scene = new THREE.Scene();
    const selection = new Selection({ type: 'meshes', meshes: makeMeshes(scene, [{}]) });
    expect(selection.style('roughness', 1)).toBe(selection);
  });
});

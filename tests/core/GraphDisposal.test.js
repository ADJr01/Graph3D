import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { disposeMaterial, disposeObjectTree, retainTexture, releaseTexture } from '../../src/core/GraphDisposal.js';

function makeTexture() {
  return new THREE.Texture();
}

describe('disposeMaterial', () => {
  it('disposes the material itself', () => {
    const material = new THREE.MeshBasicMaterial();
    const spy = vi.spyOn(material, 'dispose');
    disposeMaterial(material);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disposes every never-retained texture it references, unconditionally (pre-Prompt-111 default behavior)', () => {
    const map = makeTexture();
    const material = new THREE.MeshBasicMaterial({ map });
    const spy = vi.spyOn(map, 'dispose');
    disposeMaterial(material);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('handles an array of materials', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const spies = materials.map((m) => vi.spyOn(m, 'dispose'));
    disposeMaterial(materials);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});

describe('retainTexture / releaseTexture', () => {
  it('a never-retained texture disposes on its first release', () => {
    const texture = makeTexture();
    const spy = vi.spyOn(texture, 'dispose');
    releaseTexture(texture);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('a texture retained once survives one release, disposes on the second', () => {
    const texture = makeTexture();
    const spy = vi.spyOn(texture, 'dispose');
    retainTexture(texture);
    releaseTexture(texture);
    expect(spy).not.toHaveBeenCalled();
    releaseTexture(texture);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('a texture retained N times needs N releases before disposing', () => {
    const texture = makeTexture();
    const spy = vi.spyOn(texture, 'dispose');
    retainTexture(texture);
    retainTexture(texture);
    retainTexture(texture); // net: +3 relative to the implicit baseline
    releaseTexture(texture);
    releaseTexture(texture);
    releaseTexture(texture);
    expect(spy).not.toHaveBeenCalled();
    releaseTexture(texture);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disposeMaterial respects an outstanding retain on a shared texture across two materials', () => {
    const sharedMap = makeTexture();
    const spy = vi.spyOn(sharedMap, 'dispose');
    const materialA = new THREE.MeshBasicMaterial({ map: sharedMap });
    const materialB = new THREE.MeshBasicMaterial({ map: sharedMap });

    retainTexture(sharedMap); // materialB's share, on top of the implicit one from materialA's creation

    disposeMaterial(materialA);
    expect(spy).not.toHaveBeenCalled(); // materialB still needs it

    disposeMaterial(materialB);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('disposeObjectTree', () => {
  it('disposes geometry and material of every mesh in the subtree', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(mesh);
    const geometrySpy = vi.spyOn(mesh.geometry, 'dispose');
    const materialSpy = vi.spyOn(mesh.material, 'dispose');
    disposeObjectTree(root);
    expect(geometrySpy).toHaveBeenCalledOnce();
    expect(materialSpy).toHaveBeenCalledOnce();
  });
});

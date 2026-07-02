import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  registerSceneObject,
  unregisterSceneObject,
  getSceneObjectsByName,
} from '../../src/scene/GraphSceneRegistry.js';

describe('GraphSceneRegistry', () => {
  it('getSceneObjectsByName returns an empty array when nothing is registered', () => {
    expect(getSceneObjectsByName(new THREE.Scene(), 'x')).toEqual([]);
  });

  it('returns a registered object by name', () => {
    const scene = new THREE.Scene();
    const obj = { id: 1 };
    registerSceneObject(scene, 'bar_0', obj);
    expect(getSceneObjectsByName(scene, 'bar_0')).toEqual([obj]);
  });

  it('supports multiple objects registered under the same name', () => {
    const scene = new THREE.Scene();
    const a = { id: 1 };
    const b = { id: 2 };
    registerSceneObject(scene, 'bar_0', a);
    registerSceneObject(scene, 'bar_0', b);
    expect(getSceneObjectsByName(scene, 'bar_0')).toEqual([a, b]);
  });

  it('keeps registries independent per scene', () => {
    const sceneA = new THREE.Scene();
    const sceneB = new THREE.Scene();
    const obj = { id: 1 };
    registerSceneObject(sceneA, 'bar_0', obj);
    expect(getSceneObjectsByName(sceneB, 'bar_0')).toEqual([]);
  });

  it('unregisterSceneObject removes only the given object', () => {
    const scene = new THREE.Scene();
    const a = { id: 1 };
    const b = { id: 2 };
    registerSceneObject(scene, 'bar_0', a);
    registerSceneObject(scene, 'bar_0', b);
    unregisterSceneObject(scene, 'bar_0', a);
    expect(getSceneObjectsByName(scene, 'bar_0')).toEqual([b]);
  });

  it('unregisterSceneObject is a no-op for an object that was never registered', () => {
    const scene = new THREE.Scene();
    expect(() => unregisterSceneObject(scene, 'nonexistent', {})).not.toThrow();
  });

  it('returns a fresh array each call — mutating the result does not affect the registry', () => {
    const scene = new THREE.Scene();
    const obj = { id: 1 };
    registerSceneObject(scene, 'bar_0', obj);
    const result = getSceneObjectsByName(scene, 'bar_0');
    result.push({ id: 2 });
    expect(getSceneObjectsByName(scene, 'bar_0')).toEqual([obj]);
  });
});

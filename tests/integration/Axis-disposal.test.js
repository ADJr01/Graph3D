import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Axis } from '../../src/compose/axis/Axis.js';
import { scale } from '../../src/compose/scale/index.js';

describe('Axis disposal', () => {
  it('creates and disposes 1 000 axes without throwing or leaking scene children', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 1_000; i++) {
      new Axis().scale(scale.linear().domain([0, 10]).range([0, 10])).render(scene, `a${i}`).dispose();
    }
    expect(scene.children.length).toBe(0);
  });
});

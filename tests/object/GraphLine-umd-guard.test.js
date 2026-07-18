import { describe, it, expect, vi } from 'vitest';

// GraphLine.test.js exercises the real Line2/LineGeometry/LineMaterial
// classes (they work fine in jsdom); this file is kept separate specifically
// to mock one of them broken, simulating the UMD-build-without-globals case
// (improvement.md initiative (d) PR 2) without disturbing those real-class tests.
vi.mock('three/examples/jsm/lines/LineMaterial.js', () => ({
  LineMaterial: vi.fn(() => {
    throw new TypeError("Cannot read properties of undefined (reading 'LineMaterial')");
  }),
}));

import * as THREE from 'three';
import { GraphLine } from '../../src/object/GraphLine.js';

describe('GraphLine constructor — UMD-without-globals guard', () => {
  it('throws a clear, actionable error (not a bare TypeError) when three/examples/jsm/lines is unavailable', () => {
    expect(() => new GraphLine({ scene: new THREE.Scene(), name: 'line-a' })).toThrow(
      /GraphLine \(thick-line rendering\) isn't available in this build/,
    );
  });
});

import { describe, it, expect, vi } from 'vitest';

// Regression test for improvement.md initiative (d) PR 2: godRays.js used to
// declare `class GodRaysPass extends Pass` at module top level, so importing
// this module — which src/postfx/index.js does unconditionally, to
// self-register via PostFX.registerPass() — crashed immediately in the UMD
// <script>-tag build without the 'Pass_js' global, before Graph3D was even
// defined. Simulate that by mocking Pass as undefined (mirroring what an
// unresolved global looks like): `class X extends undefined` is a native
// TypeError, thrown wherever it's evaluated. This proves it's no longer
// evaluated at import time, only lazily inside create().
vi.mock('three/addons/postprocessing/Pass.js', () => ({
  Pass: undefined,
  FullScreenQuad: vi.fn(),
}));

import { DirectionalLight, PerspectiveCamera, Scene } from 'three';
import { PostFX } from '../../src/postfx/PostFX.js';

function makeFakeRenderer() {
  return {
    domElement: { width: 800, height: 600 },
    getPixelRatio: () => 1,
    getSize: (target) => target.set(800, 600),
  };
}

describe('godRays.js — UMD-without-globals guard', () => {
  it('importing/registering the pass does not touch Pass (no top-level extends crash)', async () => {
    await expect(import('../../src/postfx/passes/godRays.js')).resolves.toBeDefined();
  });

  it('enabling the pass throws a clear, actionable error (not a bare TypeError) once Pass is actually needed', async () => {
    await import('../../src/postfx/passes/godRays.js');
    const scene = new Scene();
    scene.add(new DirectionalLight(0xffffff, 1));
    const fx = new PostFX({ renderer: makeFakeRenderer(), scene, camera: new PerspectiveCamera() });
    expect(() => fx.enable('godRays')).toThrow(/PostFX 'godRays' pass isn't available in this build/);
  });
});

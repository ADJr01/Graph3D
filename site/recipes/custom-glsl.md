# Custom GLSL

`chart.material(presetName)` only picks from the built-in presets. For a
hand-written `THREE.ShaderMaterial`, reach one layer down: wrap the chart's
underlying rendered object — a `GraphMesh` or `GraphInstancedObject`,
exposed via `chart.selection().backend` — in a `GraphObjectMaterial` and
call `.applyShader()` directly.

```js
import * as THREE from 'three';
import { Graph3D, BarChart, scale, GraphObjectMaterial } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

const x = scale.band().domain(['A', 'B', 'C', 'D']).range([-6, 6]).paddingInner(0.3);
const y = scale.linear().domain([0, 100]).range([0, 6]);
const chart = new BarChart(scene.three).x((d) => d.k, x).y((d) => d.v, y);
chart.data([{ k: 'A', v: 42 }, { k: 'B', v: 88 }, { k: 'C', v: 15 }, { k: 'D', v: 67 }], (d) => d.k);
chart.render();

const pulseMaterial = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, color: { value: new THREE.Color('#3b82f6') } },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 color;
    varying vec3 vNormal;
    void main() {
      float pulse = 0.6 + 0.4 * sin(time * 3.0);
      gl_FragColor = vec4(color * pulse, 1.0);
    }
  `,
});

// BarChart with this many bars renders as one GraphInstancedObject; a
// chart small enough to render as individual GraphMesh instances instead
// exposes backend.meshes (an array) — see Selection's own backend union.
const backend = chart.selection().backend;
const target = backend.type === 'instanced' ? backend.object : backend.meshes[0];

new GraphObjectMaterial(target).applyShader(pulseMaterial).bindUniforms({ time: 'auto' });

scene.camera.three.position.set(0, 8, 14);
scene.camera.lookAt(0, 2, 0);
```

`bindUniforms({ time: 'auto' })` drives `time` off the shared render loop —
no manual `loop.add()` needed just to animate a uniform. Re-calling
`applyShader()` with `{ preserveUniforms: true }` after editing the GLSL
text (a hot-reload workflow) carries over any uniform *values* you'd
already tweaked, by name, instead of resetting to the new material's
defaults.

## Library-wide: a reusable named preset

The `pulseMaterial` above is one-off — wired to a single chart, thrown away
with it. A shader meant to be reused across a project as a named preset
(`material.myPreset(options)`, alongside the built-in `.holographic()`,
`.crystal()`, `.neon()`, `.glow()`, ...) follows CLAUDE.md §5's "New material
preset" checklist: one factory function per file under `src/material/presets/`,
re-exported from `material/index.js`'s `material` namespace object.

```js
// src/material/presets/scanline.js
import * as THREE from 'three';
import { assertPlainOptions, assertFiniteNumber } from '../validate.js';
import { WORLD_SPACE_VERTEX_SHADER } from './shaderChunks.js';

const FRAGMENT_SHADER = `
  uniform vec3 color;
  uniform float speed;
  uniform float density;
  uniform float time; // 'auto'-bound by bindUniforms — see below

  varying vec2 vUv; // WORLD_SPACE_VERTEX_SHADER's own varying (also declares vNormal/vViewDir)

  void main() {
    float scan = sin(vUv.y * density - time * speed) * 0.5 + 0.5;
    gl_FragColor = vec4(color * scan, 1.0);
  }
`;

/**
 * Animated horizontal scanlines sweeping up an object in world space —
 * a sci-fi "data materializing" look.
 * @param {{ color?: (string|number|THREE.Color), speed?: number, density?: number } & THREE.ShaderMaterialParameters} [options]
 * @returns {THREE.ShaderMaterial}
 * @throws {TypeError} If `options` is not a plain object, or `speed`/`density` aren't finite numbers.
 * @example material.scanline({ color: '#39ff14', speed: 2, density: 8 });
 */
export function scanline(options = {}) {
  assertPlainOptions('material.scanline', options);
  const { color = '#39ff14', speed = 2, density = 8, ...rest } = options;
  assertFiniteNumber('material.scanline', 'speed', speed);
  assertFiniteNumber('material.scanline', 'density', density);

  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      speed: { value: speed },
      density: { value: density },
      time: { value: 0 }, // the exact key 'time' bindUniforms({ time: 'auto' }) looks for
    },
    vertexShader: WORLD_SPACE_VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    ...rest,
  });
}
```

Wire it into the `material` namespace (`src/material/index.js`), next to the
other preset imports:

```js
// src/material/index.js
import { scanline } from './presets/scanline.js';
// ... alongside the existing preset imports

export const material = {
  // ... existing presets
  scanline,
};
```

Consumed exactly like a built-in preset — no different from `.holographic()`
or `.glow()` to a caller, because it *is* one now. The `time` uniform still
needs `bindUniforms({ time: 'auto' })` to actually animate (a preset factory
only builds the material — it doesn't self-drive its own uniforms, same as
every other built-in preset):

```js
chart.material('scanline', { color: '#39ff14', speed: 3 }); // set before render() — resolved into the mesh material there
chart.render();

const backend = chart.selection().backend;
const target = backend.type === 'instanced' ? backend.object : backend.meshes[0];
new GraphObjectMaterial(target).bindUniforms({ time: 'auto' });
```

Per CLAUDE.md §5's checklist: add a leak test (material + any texture
disposal) alongside the other preset tests in `tests/material/presets/`, and
a gallery entry in `examples/06-materials/` so it's visually reviewable —
see [Concepts: Material — Material-picker gallery](/concepts/material#material-picker-gallery)
for how the existing presets are wired into that gallery.

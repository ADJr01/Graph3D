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

For shaders meant to be reused across a project as a named preset (rather
than applied ad hoc to one chart), see `material/presets/` and CLAUDE.md
§5's "New material preset" checklist — `material.holographic()`,
`.crystal()`, `.neon()`, and `.glow()` are all built the same way this
recipe's `pulseMaterial` is.

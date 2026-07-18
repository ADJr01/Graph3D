# Custom Lighting Setup

`scene.light` (a `GraphSceneLight`) manages the light rig via named presets
by default, but tracks preset-managed and user-added lights separately —
switching presets never disturbs a light you added by hand, and you can mix
both freely.

```js
import { Graph3D } from 'graph3d.js';

const canvas = document.querySelector('canvas');
const g = new Graph3D({ canvas });
const scene = g.createScene('main');
g.setActiveScene(scene);

// Six built-in presets, swappable any time:
scene.light.setPreset('cinematic');
// 'ambient-only' | 'three-point' (default) | 'studio' | 'flat' | 'cinematic' | 'product-shot'
```

## Tuning a preset without replacing it

`three-point`, `studio`, and `cinematic` all expose a key/fill/rim/ambient
role — tune any of them independently without rebuilding the whole rig:

```js
scene.light.setPreset('cinematic').setKeyIntensity(3).setRimIntensity(2.5);
scene.light.setFillIntensity(0.1);
scene.light.setAmbientIntensity(0.05);
```

Each setter is a no-op (not a throw) if the active preset has no light in
that role — `ambient-only`/`flat` only have an ambient light, so
`setKeyIntensity()` there silently does nothing rather than erroring.

## Adding your own lights

```js
import * as THREE from 'three';

const accent = new THREE.PointLight(0xff6633, 2, 15);
accent.position.set(3, 2, -2);
scene.light.addLight(accent, 'accent'); // named, so it can be removed later

// An unnamed light gets an auto-generated name:
scene.light.addLight(new THREE.SpotLight(0x66ccff, 1.5));

// Later:
scene.light.removeLight('accent');
// or by reference:
scene.light.removeLight(accent);
```

Switching presets (`setPreset()`) only replaces preset-managed lights —
`accent` survives every preset swap until you explicitly `removeLight()` it.

## Building a fully custom rig from scratch

For a rig with no preset lights at all, start from `'ambient-only'` (the
smallest preset — a single dim ambient light) and add everything else by
hand:

```js
scene.light.setPreset('ambient-only').setAmbientIntensity(0.15);

const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(6, 10, 4);
key.castShadow = true;
scene.light.addLight(key, 'key');

const bounce = new THREE.HemisphereLight(0x8899aa, 0x332211, 0.4);
scene.light.addLight(bounce, 'bounce');
```

## `RectAreaLight` presets need one-time setup

The `studio` and `product-shot` presets use `THREE.RectAreaLight` for soft,
physically-based area lighting. Three.js requires
`RectAreaLightUniformsLib.init()` to be called once, before the first render,
for these to light correctly — without it they render as if their intensity
were near zero:

```js
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init(); // once, at app startup
scene.light.setPreset('studio');
```

## Cleaning up

`scene.light.dispose()` removes every managed and user-added light from the
scene (idempotent — safe to call twice). `GraphScene.dispose()` already calls
this for you; call it directly only if you want to strip a scene's lighting
without disposing the whole scene.

See [Concepts: Scene Composition — Lights](/concepts/scene#lights) for the
full preset reference and [Camera](/concepts/scene#camera) for how
`cinematic-low`/`cinematic-high` camera presets are typically paired with
the `cinematic` lighting preset for a matched look.
